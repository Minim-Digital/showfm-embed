/**
 * The page audio controller: one plays and the others pause, subscribers
 * see what is playing, and "Powered by show.fm" goes to one embed per page.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	PageAudioController,
	creditWanted,
	pageController,
	type PlaybackSnapshot
} from '../controller';

/** jsdom has no media playback: an <audio> whose play/pause fire the events. */
function fakeAudio() {
	const audio = document.createElement('audio');
	let paused = true;
	Object.defineProperty(audio, 'paused', { get: () => paused });
	Object.defineProperty(audio, 'duration', { value: 120, configurable: true });
	audio.play = vi.fn(async () => {
		paused = false;
		audio.dispatchEvent(new Event('play'));
	});
	audio.pause = vi.fn(() => {
		if (paused) return;
		paused = true;
		audio.dispatchEvent(new Event('pause'));
	});
	return audio;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('one plays at a time', () => {
	it('pauses every other attached audio when one starts', async () => {
		const controller = new PageAudioController();
		const [a, b, c] = [fakeAudio(), fakeAudio(), fakeAudio()];
		controller.attach(a, a);
		controller.attach(b, b);
		controller.attach(c, c);
		await a.play();
		expect(a.paused).toBe(false);
		await b.play();
		expect(a.paused).toBe(true);
		expect(b.paused).toBe(false);
		expect(c.pause).not.toHaveBeenCalled();
		await c.play();
		expect(b.paused).toBe(true);
	});

	it('stops managing an audio once detached', async () => {
		const controller = new PageAudioController();
		const [a, b] = [fakeAudio(), fakeAudio()];
		controller.attach(a, a);
		const detach = controller.attach(b, b);
		await b.play();
		detach();
		await a.play();
		expect(b.paused).toBe(false);
	});

	it('plays elements without their own audio on one shared element', async () => {
		const controller = new PageAudioController();
		const own = fakeAudio();
		controller.attach(own, own);
		await own.play();
		const shared = controller.sharedAudio();
		expect(controller.sharedAudio()).toBe(shared);
		expect(shared.preload).toBe('none');
		let paused = true;
		Object.defineProperty(shared, 'paused', { get: () => paused });
		shared.play = vi.fn(async () => {
			paused = false;
			shared.dispatchEvent(new Event('play'));
		});
		const owner = {};
		await controller.playShared(owner, { id: 'e2', title: 'Two' }, 'https://m.cdn.media/two.mp3');
		expect(shared.getAttribute('src')).toBe('https://m.cdn.media/two.mp3');
		expect(own.paused).toBe(true);
		expect(controller.snapshot()).toMatchObject({ owner, episode: { id: 'e2' }, state: 'playing' });
	});
});

describe('what a transcript can follow', () => {
	it('lists every attached audio, the current one first, and tells subscribers of a new one', async () => {
		const controller = new PageAudioController();
		const first = fakeAudio();
		const second = fakeAudio();
		const seen = vi.fn();
		controller.subscribe(seen);
		seen.mockClear();
		controller.attach(first, first, { id: 'one', title: 'One' });
		expect(seen).toHaveBeenCalledTimes(1);
		const detach = controller.attach(second, second, { id: 'two', title: 'Two' });
		expect(controller.audios().map((entry) => entry.episode?.id)).toEqual(['one', 'two']);
		await second.play();
		expect(controller.audios().map((entry) => entry.episode?.id)).toEqual(['two', 'one']);
		detach();
		expect(controller.audios().map((entry) => entry.episode?.id)).toEqual(['one']);
	});

	it('tells subscribers when any audio is detached, current or not', async () => {
		const controller = new PageAudioController();
		const kept = fakeAudio();
		const gone = fakeAudio();
		controller.attach(kept, kept, { id: 'kept', title: 'Kept' });
		const detach = controller.attach(gone, gone, { id: 'gone', title: 'Gone' });
		await kept.play();
		const seen = vi.fn();
		controller.subscribe(seen);
		seen.mockClear();
		detach();
		expect(seen).toHaveBeenCalledTimes(1);
		expect(controller.audios().map((entry) => entry.episode?.id)).toEqual(['kept']);
	});

	it('creating the shared audio does not call subscribers back into it', () => {
		const controller = new PageAudioController();
		controller.subscribe(() => controller.sharedAudio());
		expect(controller.sharedAudio()).toBeInstanceOf(HTMLAudioElement);
	});
});

describe('subscribers', () => {
	it('see the current episode, time and state', async () => {
		const controller = new PageAudioController();
		const audio = fakeAudio();
		controller.attach(audio, audio, { id: 'e1', title: 'One' });
		const seen: PlaybackSnapshot[] = [];
		const unsubscribe = controller.subscribe((snapshot) => seen.push(snapshot));
		expect(seen[0]).toEqual({
			owner: null,
			episode: null,
			currentTime: 0,
			duration: 0,
			state: 'idle'
		});
		await audio.play();
		expect(seen.at(-1)).toMatchObject({
			owner: audio,
			episode: { id: 'e1' },
			state: 'playing',
			duration: 120
		});
		audio.currentTime = 30;
		audio.dispatchEvent(new Event('timeupdate'));
		expect(seen.at(-1)?.currentTime).toBe(30);
		audio.pause();
		expect(seen.at(-1)?.state).toBe('paused');
		audio.dispatchEvent(new Event('ended'));
		expect(seen.at(-1)?.state).toBe('ended');
		unsubscribe();
		const count = seen.length;
		await audio.play();
		expect(seen).toHaveLength(count);
	});
});

describe('the shared audio, for the mini-player (EMB-4)', () => {
	function sharedController() {
		const controller = new PageAudioController();
		const shared = controller.sharedAudio();
		let paused = true;
		Object.defineProperty(shared, 'paused', { get: () => paused });
		shared.play = vi.fn(async () => {
			paused = false;
			shared.dispatchEvent(new Event('play'));
		});
		shared.pause = vi.fn(() => {
			paused = true;
			shared.dispatchEvent(new Event('pause'));
		});
		return { controller, shared };
	}

	it('has no state until an element plays something there', async () => {
		const { controller } = sharedController();
		expect(controller.sharedState()).toBeNull();
		const owner = {};
		await controller.playShared(owner, { id: 'e1', title: 'One' }, 'https://m.cdn.media/one.mp3');
		expect(controller.sharedState()).toMatchObject({
			owner,
			episode: { id: 'e1' },
			state: 'playing',
			message: null
		});
	});

	it("is news to subscribers even when another element's audio is current", async () => {
		const { controller, shared } = sharedController();
		await controller.playShared({}, { id: 'e1', title: 'One' }, 'https://m.cdn.media/one.mp3');
		const player = fakeAudio();
		controller.attach(player, player);
		await player.play();
		const seen: string[] = [];
		controller.subscribe(() => seen.push(controller.sharedState()!.state));
		// The player is current; the shared audio's own events still reach subscribers.
		shared.dispatchEvent(new Event('waiting'));
		expect(seen.at(-1)).toBe('loading');
		expect(controller.snapshot().owner).toBe(player);
	});

	it("takes a message only from the shared audio's owner, and forgets it on the next play", async () => {
		const { controller } = sharedController();
		const owner = {};
		await controller.playShared(owner, { id: 'e1', title: 'One' }, 'https://m.cdn.media/one.mp3');
		controller.sharedAudio().dispatchEvent(new Event('error'));
		const seen = vi.fn();
		controller.subscribe(seen);
		controller.report({}, 'e1', 'suspended');
		expect(controller.sharedState()!.message).toBeNull();
		controller.report(owner, 'e1', 'suspended');
		expect(controller.sharedState()!.message).toBe('suspended');
		expect(seen).toHaveBeenCalledTimes(2);
		await controller.playShared(owner, { id: 'e2', title: 'Two' }, 'https://m.cdn.media/two.mp3');
		expect(controller.sharedState()!.message).toBeNull();
	});

	it("a failure's recheck applies only until the episode plays anywhere or the owner changes", async () => {
		const { controller, shared } = sharedController();
		const button = {};
		await controller.playShared(button, { id: 'a', title: 'A' }, 'https://m.cdn.media/a.mp3');
		shared.dispatchEvent(new Event('error'));
		const applies = controller.failure(button, 'a');
		expect(applies()).toBe(true);
		// Another episode starting on some other audio changes nothing.
		const player = fakeAudio();
		controller.attach(player, player, { id: 'other', title: 'Other' });
		player.dispatchEvent(new Event('playing'));
		expect(applies()).toBe(true);
		// The same episode starting on a player's own audio makes it stale.
		const copy = fakeAudio();
		controller.attach(copy, copy, { id: 'a', title: 'A' });
		copy.dispatchEvent(new Event('playing'));
		expect(applies()).toBe(false);
		// So does another element taking the shared audio, even for the same episode.
		const again = controller.failure(button, 'a');
		await controller.playShared({}, { id: 'a', title: 'A' }, 'https://m.cdn.media/a.mp3');
		expect(again()).toBe(false);
	});

	it("goes stale on another audio's play event, before it is playing", async () => {
		const { controller, shared } = sharedController();
		const button = {};
		await controller.playShared(button, { id: 'a', title: 'A' }, 'https://m.cdn.media/a.mp3');
		shared.dispatchEvent(new Event('error'));
		const applies = controller.failure(button, 'a');
		// A player starts the same episode and is still buffering: play, no playing yet.
		const player = document.createElement('audio');
		controller.attach(player, player, { id: 'a', title: 'A' });
		player.dispatchEvent(new Event('play'));
		expect(applies()).toBe(false);
	});

	it('goes stale on an explicit play request through the controller, before any event', () => {
		const { controller, shared } = sharedController();
		const list = {};
		void controller.playShared(list, { id: 'a', title: 'A' }, 'https://m.cdn.media/a.mp3');
		shared.dispatchEvent(new Event('error'));
		const applies = controller.failure(list, 'a');
		// The same owner asks again; the request has not produced an event yet.
		shared.play = vi.fn(() => new Promise<void>(() => {}));
		void controller.playShared(list, { id: 'a', title: 'A' }, 'https://m.cdn.media/a.mp3');
		expect(applies()).toBe(false);
	});

	it('drops a late report about an earlier episode from the same owner', async () => {
		const { controller, shared } = sharedController();
		const list = {};
		// Episode A fails; while the owner asks the API why, B starts in the same list.
		await controller.playShared(list, { id: 'a', title: 'A' }, 'https://m.cdn.media/a.mp3');
		shared.dispatchEvent(new Event('error'));
		await controller.playShared(list, { id: 'b', title: 'B' }, 'https://m.cdn.media/b.mp3');
		controller.report(list, 'a', 'error');
		expect(controller.sharedState()!.message).toBeNull();
		expect(shared.paused).toBe(false);
	});

	it('drops a late report when the same episode has started again since it failed', async () => {
		const { controller, shared } = sharedController();
		const button = {};
		await controller.playShared(button, { id: 'a', title: 'A' }, 'https://m.cdn.media/a.mp3');
		shared.dispatchEvent(new Event('error'));
		await controller.playShared(button, { id: 'a', title: 'A' }, 'https://m.cdn.media/a.mp3');
		controller.report(button, 'a', 'suspended');
		expect(controller.sharedState()!.message).toBeNull();
	});
});

describe('"Powered by show.fm" once per page', () => {
	function hosts(count: number) {
		return Array.from({ length: count }, () =>
			document.body.appendChild(document.createElement('div'))
		);
	}

	it('goes to the first embed in document order that wants it, claimed in any order', () => {
		const controller = new PageAudioController();
		const [first, second, third] = hosts(3);
		const granted = new Map<Element, boolean>();
		const claim = (host: Element) => controller.claimCredit(host, (g) => granted.set(host, g));
		const c3 = claim(third);
		const c2 = claim(second);
		const c1 = claim(first);
		c3.set(true);
		c2.set(true);
		// The first is still loading: nobody shows the credit yet.
		expect([...granted.values()].some(Boolean)).toBe(false);
		c1.set(false);
		expect(granted.get(second)).toBe(true);
		expect(granted.get(third)).toBeFalsy();
		// The first loads and wants it after all: it moves up.
		c1.set(true);
		expect(granted.get(first)).toBe(true);
		expect(granted.get(second)).toBe(false);
	});

	it('passes to the next embed when the holder goes, and never to one that is off', () => {
		const controller = new PageAudioController();
		const [first, second, third] = hosts(3);
		const granted = new Map<Element, boolean>();
		const claims = [first, second, third].map((host) =>
			controller.claimCredit(host, (g) => granted.set(host, g))
		);
		claims[0].set(true);
		claims[1].set(false);
		claims[2].set(true);
		expect(granted.get(first)).toBe(true);
		claims[0].release();
		expect(granted.get(third)).toBe(true);
		expect(granted.get(second)).toBeFalsy();
	});

	it('is one controller per page, shared through globalThis', () => {
		expect(pageController()).toBe(pageController());
		expect(
			(globalThis as unknown as Record<symbol, unknown>)[
				Symbol.for('showfm.page-audio-controller.v1')
			]
		).toBe(pageController());
	});
});

// The credit rule every element follows (EMB-7). show_powered_by is false
// only for a show whose plan includes branding removal and that turned the
// credit off (the public API's resolveBranding).
describe('creditWanted', () => {
	const entitled = { show_powered_by: false };
	const notEntitled = { show_powered_by: true };
	it.each([
		// credit, branding, platform, shown
		['auto', notEntitled, null, true],
		['auto', entitled, null, false],
		['off', notEntitled, null, true],
		['off', entitled, null, false],
		['on', entitled, null, true],
		['on', notEntitled, null, true],
		[null, notEntitled, null, true],
		['nonsense', entitled, null, false],
		// No payload (loading, an error) or one cached before the field: shown.
		['auto', null, null, true],
		['off', null, null, true],
		['off', {}, null, true],
		// The WordPress plugin: credit="off" is the site owner's to set.
		['off', notEntitled, 'wordpress', false],
		['off', null, 'wordpress', false],
		['auto', notEntitled, 'wordpress', true],
		['on', entitled, 'wordpress', true],
		['off', notEntitled, 'other', true]
	] as const)('credit=%s, branding %o, platform %s: %s', (credit, branding, platform, shown) => {
		expect(creditWanted(credit, branding, platform)).toBe(shown);
	});
});
