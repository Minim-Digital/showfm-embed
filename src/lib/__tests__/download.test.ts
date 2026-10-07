/**
 * Download-link helpers: filesystem-safe filenames and the ?dl= parameter
 * that triggers media-delivery's Content-Disposition attachment.
 */
import { describe, expect, it } from 'vitest';
import { downloadFilename, downloadHref } from '../download';

describe('downloadFilename', () => {
	it('slugifies the title and maps the MIME type to an extension', () => {
		expect(downloadFilename('Episode One', 'audio/mpeg')).toBe('episode-one.mp3');
		expect(downloadFilename('Ep #4 — The "Return"!', 'audio/x-m4a')).toBe('ep-4-the-return.m4a');
		expect(downloadFilename('Wav Test', 'audio/wav')).toBe('wav-test.wav');
	});

	it('defaults sensibly for empty titles and unknown types', () => {
		expect(downloadFilename('!!!', null)).toBe('episode.mp3');
		expect(downloadFilename('Show', 'application/octet-stream')).toBe('show.mp3');
	});

	it('caps very long titles', () => {
		const name = downloadFilename('x'.repeat(200), 'audio/mpeg');
		expect(name.length).toBeLessThanOrEqual(64);
	});
});

describe('downloadHref', () => {
	it('appends dl= to an already source-tagged URL', () => {
		expect(downloadHref('https://media.example.com/a.mp3?src=embed', 'ep.mp3')).toBe(
			'https://media.example.com/a.mp3?src=embed&dl=ep.mp3'
		);
	});

	it('starts the query when none exists and URL-encodes the filename', () => {
		expect(downloadHref('https://media.example.com/a.mp3', 'my ep.mp3')).toBe(
			'https://media.example.com/a.mp3?dl=my%20ep.mp3'
		);
	});
});
