/**
 * Transcripts for tests: an episode payload with a WebVTT on show.fm's media
 * host, and VTT files made the way the app's renderVtt writes them (a voice
 * span per cue and an inline timestamp before every word after the first).
 * The conversation is the one in the design (page 3.1).
 */
export const TRANSCRIPT_EPISODE_ID = '7a7a7a7a-1111-4222-8333-444444444444';
export const TRANSCRIPT_AUDIO = 'https://m.cdn.media/the-long-table/bakery.mp3';
export const TRANSCRIPT_VTT = 'https://m.cdn.media/the-long-table/bakery.vtt';
export const EXTERNAL_TRANSCRIPT_AUDIO = 'https://media.example.test/bakery.mp3';

export const CONVERSATION: [string, string][] = [
	['Maya', 'So the bakery had been closed for, what, eleven years when you came back?'],
	[
		'Tom',
		'Twelve, nearly. The ovens were still there. Nobody had wanted to move them, they weigh about four tons each.'
	],
	['Maya', 'And you’d never baked professionally.'],
	[
		'Tom',
		'Never. I’d made bread at home, like everyone did in 2020. That’s not the same thing as four hundred loaves before seven in the morning.'
	],
	['Maya', 'What was the first week like?'],
	[
		'Tom',
		'Honestly? I threw away more dough than I sold. The starter didn’t like the building. It took a month before it settled.'
	],
	['Maya', 'The starter didn’t like the building.'],
	[
		'Tom',
		'It sounds strange, but it’s true. Every bakery has its own yeasts in the walls and the wood. Ours had been asleep.'
	],
	['Maya', 'So how did you wake it up?'],
	[
		'Tom',
		'My great-grandfather’s notebook, mostly. He wrote down the temperature of the room every single morning for thirty years.'
	],
	['Maya', 'Every morning?'],
	[
		'Tom',
		'Every morning. Next to the weather, and how many loaves he sold. I worked out he sold more bread when it rained.'
	],
	['Maya', 'That’s the most bakery thing I’ve ever heard.'],
	[
		'Tom',
		'People stay home, they want something warm. It still works. Saturday it poured and we sold out of bread by nine.'
	],
	[
		'Maya',
		'Let’s talk about money, because people always ask me this. Can a village bakery actually pay for itself?'
	],
	[
		'Tom',
		'Not on bread alone. Bread keeps the lights on. The coffee and the pastries pay my salary.'
	]
];

function stamp(seconds: number): string {
	const ms = Math.round(seconds * 1000);
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor(ms / 60_000) % 60;
	const s = Math.floor(ms / 1000) % 60;
	const rest = ms % 1000;
	const pad = (n: number, width = 2) => String(n).padStart(width, '0');
	return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(rest, 3)}`;
}

const escape = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface VttOptions {
	/** Inline word timestamps (the default), or none (line-only). */
	words?: boolean;
	/** Seconds the first cue starts at. */
	start?: number;
	/** Seconds per word. */
	pace?: number;
	/** Shift every word timing by this much (stale timings after an audio swap). */
	wordShift?: number;
	/** Repeat the conversation this many times (a long transcript). */
	repeat?: number;
}

/** A WebVTT file of the conversation; `cues` gives the times of each cue. */
export function conversationVtt({
	words = true,
	start = 0,
	pace = 0.36,
	wordShift = 0,
	repeat = 1
}: VttOptions = {}) {
	const blocks = ['WEBVTT', ''];
	const cues: { start: number; end: number; speaker: string; text: string }[] = [];
	let at = start;
	for (let round = 0; round < repeat; round++) {
		for (const [speaker, text] of CONVERSATION) {
			const list = text.split(' ');
			const end = at + list.length * pace + 0.4;
			const payload = list
				.map((word, i) =>
					i === 0 || !words ? escape(word) : `<${stamp(at + i * pace + wordShift)}>${escape(word)}`
				)
				.join(' ');
			blocks.push(`${stamp(at)} --> ${stamp(end)}`, `<v ${speaker}>${payload}</v>`, '');
			cues.push({ start: at, end, speaker, text });
			at = end + 0.35;
		}
	}
	return { vtt: blocks.join('\n'), cues, duration: Math.ceil(at) };
}

/** GET /v1/episodes/{id} → data, for an episode with a transcript. */
export function transcriptEpisode({
	audio = TRANSCRIPT_AUDIO,
	vtt = TRANSCRIPT_VTT as string | null,
	duration = 3138,
	theme = null as string | null
} = {}) {
	return {
		id: TRANSCRIPT_EPISODE_ID,
		title: 'Sourdough, salt and the slow return of the village bakery',
		published_at: '2026-09-24T09:00:00.000Z',
		season_number: 2,
		episode_number: 4,
		audio: { url: audio, content_type: 'audio/mpeg', duration_seconds: duration },
		artwork: { url: 'https://media.example.test/cover.png' },
		links: { listen: 'https://show.fm/the-long-table/e/bakery' },
		transcript: vtt ? { url: vtt, type: 'text/vtt' } : null,
		podcast: {
			title: 'The Long Table',
			brand_color: '#7E22CE',
			player_color: null,
			player_theme: theme,
			player_waveform: true,
			branding: { show_powered_by: true }
		}
	};
}
