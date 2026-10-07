/**
 * `<showfm-episodes>` as v1.js registers it: a stub that costs v1.js a few
 * hundred bytes. The list itself is a lazy chunk (episodes.svelte.ts and
 * EpisodeList.svelte), loaded the first time an element connects.
 *
 * Until the chunk is here the element has no shadow root, so its light-DOM
 * fallback list (renderEpisodeListHTML) stays on show, styled by
 * v1-fallback.css. If the chunk never arrives, the fallback is what the
 * visitor keeps, and the next element to connect tries again.
 *
 * `load="click"`: nothing is fetched, not even the chunk, until the facade
 * the inline loader drew is pressed (it sets data-showfm-activated) or
 * `showfm.load()` runs. Until then the loader's facade, or without the
 * loader the fallback list, is what shows.
 */
import type { mountEpisodes } from './episodes.svelte.js';

type Chunk = { mountEpisodes: typeof mountEpisodes };
/** What the chunk gives back: called with false on disconnect, true on reconnect. */
type Connection = (connected: boolean) => void;

/**
 * v1.js's own exports: the bindings the chunks share with it. Only the CDN
 * build has them (vite.cdn.config.ts wraps v1.js and defines this).
 */
declare const exports: object;

const REGISTRY = Symbol.for('showfm.chunks.v1');
const script = typeof document !== 'undefined' ? document.currentScript : null;
const pending: Record<string, Promise<Chunk>> = {};

/**
 * In v1.js, vite.cdn.config.ts renders `import()` as the chunk's path, and
 * this adds the chunk as a script next to v1.js (once, with the page's
 * nonce), then runs the factory it registers. The npm root has registered
 * the factories already, so nothing is fetched there. Anywhere else the
 * import is a real one.
 */
function load(chunk: string | Promise<Chunk>): Promise<Chunk> {
	if (typeof chunk !== 'string') return chunk;
	const key = chunk.replace(/^\.\//, '');
	return (pending[key] ??= new Promise((resolve, reject) => {
		const registry = ((globalThis as unknown as Record<symbol, Record<string, unknown>>)[
			REGISTRY
		] ??= {}) as Record<string, (shared: () => object, exports: object) => void>;
		const run = () => {
			const exported = {} as Chunk;
			registry[key](() => exports, exported);
			resolve(exported);
		};
		const fail = () => {
			delete pending[key];
			reject(new Error(key));
		};
		if (registry[key]) return run();
		const src = (script as HTMLScriptElement | null)?.src;
		if (!src) return fail();
		const tag = document.createElement('script');
		tag.src = new URL(chunk, src).href;
		if ((script as HTMLScriptElement).nonce) tag.nonce = (script as HTMLScriptElement).nonce;
		tag.onload = () => (registry[key] ? run() : fail());
		tag.onerror = () => {
			tag.remove();
			fail();
		};
		document.head.append(tag);
	}));
}

const ACTIVATED = 'data-showfm-activated';

class ShowfmEpisodesElement extends HTMLElement {
	declare showfmConnection?: Connection | null;

	static observedAttributes = [ACTIVATED];

	attributeChangedCallback() {
		if (this.isConnected) this.connectedCallback();
	}

	connectedCallback() {
		if (this.showfmConnection) return this.showfmConnection(true);
		if (this.showfmConnection === null) return;
		if (this.getAttribute('load') === 'click' && !this.hasAttribute(ACTIVATED)) return;
		this.showfmConnection = null;
		load(import('./episodes.svelte.js') as Promise<Chunk> | string).then(
			(chunk) => {
				this.showfmConnection = chunk.mountEpisodes(this);
				if (!this.isConnected) this.showfmConnection(false);
			},
			() => delete this.showfmConnection
		);
	}

	disconnectedCallback() {
		this.showfmConnection?.(false);
	}
}

/** Registers the element. Called by element.ts (the source is marked side-effect free). */
export function defineShowfmEpisodes() {
	if (customElements.get('showfm-episodes')) return;
	customElements.define('showfm-episodes', ShowfmEpisodesElement);
	// showfm.load() (consent tools) presses every list facade at once.
	document.addEventListener('showfm:load', () =>
		document
			.querySelectorAll('showfm-episodes[load="click"]')
			.forEach((list) => list.setAttribute(ACTIVATED, 'load'))
	);
}
