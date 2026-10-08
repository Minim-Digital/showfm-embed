/** External audio detection (design page 9, plan Q2). */
import { afterEach, describe, expect, it } from 'vitest';
import { SHOWFM_MEDIA_HOSTS, canOfferTranscript, isShowfmMediaUrl, mediaHosts } from '../hosts';

afterEach(() => {
	delete (window as unknown as { showfmMediaHosts?: unknown }).showfmMediaHosts;
});

describe('isShowfmMediaUrl', () => {
	it('accepts the show.fm media hosts, in any case', () => {
		expect(SHOWFM_MEDIA_HOSTS).toEqual(['m.cdn.media', 'media.podcasterplus.com']);
		expect(isShowfmMediaUrl('https://m.cdn.media/a.mp3')).toBe(true);
		expect(isShowfmMediaUrl('https://media.podcasterplus.com/a.mp3?src=embed')).toBe(true);
		expect(isShowfmMediaUrl('https://M.CDN.MEDIA/a.mp3')).toBe(true);
	});

	it('builds in no other environment, which a page adds itself', () => {
		expect(isShowfmMediaUrl('https://media.example.test/a.mp3', mediaHosts())).toBe(false);
		(window as unknown as { showfmMediaHosts: unknown }).showfmMediaHosts = ['media.example.test'];
		expect(isShowfmMediaUrl('https://media.example.test/a.mp3', mediaHosts())).toBe(true);
		expect(
			canOfferTranscript(
				'https://media.example.test/a.mp3',
				'https://media.example.test/t.vtt',
				mediaHosts()
			)
		).toBe(true);
	});

	it('rejects other hosts, look-alikes and junk', () => {
		expect(isShowfmMediaUrl('https://cdn.example.com/a.mp3')).toBe(false);
		expect(isShowfmMediaUrl('https://m.cdn.media.evil.test/a.mp3')).toBe(false);
		expect(isShowfmMediaUrl('https://evil.test/m.cdn.media/a.mp3')).toBe(false);
		expect(isShowfmMediaUrl('ftp://m.cdn.media/a.mp3')).toBe(false);
		expect(isShowfmMediaUrl('not a url')).toBe(false);
		expect(isShowfmMediaUrl(null)).toBe(false);
	});

	it('takes extra hosts from window.showfmMediaHosts, keeping the defaults', () => {
		(window as unknown as { showfmMediaHosts: unknown }).showfmMediaHosts = [
			'Media.Example.test',
			4
		];
		expect(isShowfmMediaUrl('https://media.example.test/a.mp3', mediaHosts())).toBe(true);
		expect(isShowfmMediaUrl('https://m.cdn.media/a.mp3', mediaHosts())).toBe(true);
	});
});

describe('canOfferTranscript', () => {
	it('needs both the audio and the VTT on show.fm hosts', () => {
		const vtt = 'https://m.cdn.media/t.vtt';
		expect(canOfferTranscript('https://m.cdn.media/a.mp3', vtt)).toBe(true);
		expect(canOfferTranscript('https://cdn.example.com/a.mp3', vtt)).toBe(false);
		expect(canOfferTranscript('https://m.cdn.media/a.mp3', 'https://cdn.example.com/t.vtt')).toBe(
			false
		);
		expect(canOfferTranscript('https://m.cdn.media/a.mp3', null)).toBe(false);
	});
});
