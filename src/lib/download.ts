/**
 * Download-link helpers for the player's download button.
 *
 * The real attachment behavior comes from media-delivery's ?dl= parameter
 * (Content-Disposition: attachment) — the anchor's download attribute is
 * ignored cross-origin, so the header is what makes browsers save instead
 * of navigate. Pure + tested; compiled into the player bundle.
 */

const EXTENSION_BY_TYPE: Record<string, string> = {
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3',
	'audio/mp4': 'm4a',
	'audio/x-m4a': 'm4a',
	'audio/aac': 'm4a',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav',
	'audio/ogg': 'ogg'
};

/** Filesystem-safe download filename from an episode title + audio MIME type. */
export function downloadFilename(title: string, contentType: string | null): string {
	const base =
		title
			.replace(/[^a-zA-Z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.toLowerCase()
			.slice(0, 60) || 'episode';
	const extension = (contentType && EXTENSION_BY_TYPE[contentType.toLowerCase()]) || 'mp3';
	return `${base}.${extension}`;
}

/** Append the ?dl= attachment parameter to an (already source-tagged) audio URL. */
export function downloadHref(audioSrc: string, filename: string): string {
	const separator = audioSrc.includes('?') ? '&' : '?';
	return `${audioSrc}${separator}dl=${encodeURIComponent(filename)}`;
}
