/**
 * Generates custom-elements.json (Custom Elements Manifest 2.1.0).
 *
 *   node scripts/cem.mjs           write the manifest
 *   node scripts/cem.mjs --check   fail if the committed manifest is stale
 *
 * The descriptions live here. The attribute names and the CSS parts are read
 * from the components, and the script fails if an attribute has no
 * description, so the manifest cannot drift from the code.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OUTPUT = 'custom-elements.json';
const MODULE_PATH = 'dist/index.js';

/** @type {Record<string, { type: string, default?: string, field?: string, description: string }>} */
const ATTRIBUTES = {
	episode: {
		type: 'string',
		description: 'Episode UUID. Plays that one episode and wins over `podcast`.'
	},
	podcast: {
		type: 'string',
		description: 'Podcast slug or UUID. Plays the latest released episode.'
	},
	theme: {
		type: "'auto' | 'light' | 'dark'",
		description: "Pins the theme. Absent follows the show's player theme setting."
	},
	size: {
		type: "'standard' | 'compact'",
		default: "'standard'",
		description: 'Player size. The height contract depends on it.'
	},
	accent: {
		type: 'string',
		description: "Accent colour as a hex value. Absent follows the show's player colour."
	},
	wave: {
		type: "'true' | 'false'",
		description: "Pins the waveform on or off. Absent follows the show's waveform setting."
	},
	api: {
		type: 'string',
		default: "'https://api.show.fm'",
		description: 'API origin override, for development and testing only.'
	},
	'heading-level': {
		type: "'2' | '3' | '4' | '5' | '6'",
		field: 'headingLevel',
		description:
			'Wraps the episode title in a heading of this level. Absent, the title is a link and no heading is emitted.'
	},
	credit: {
		type: "'auto' | 'on' | 'off'",
		default: "'auto'",
		description:
			'The "Powered by show.fm" footer. `auto` and `off` hide it only when the show\'s plan includes branding removal and the show has turned it off (the API\'s `branding.show_powered_by` is false); with no payload it shows. `on` always shows it. With `platform="wordpress"`, `off` hides it for any show. It shows once per page, on the first embed that shows it.'
	},
	load: {
		type: "'click'",
		description:
			'`click` draws a facade and requests nothing from show.fm until the visitor presses it. `showfm.load()` loads every facade at once.'
	},
	transcript: {
		type: "'on' | 'open'",
		description:
			'`on` adds a Transcript button that opens the follow-along transcript under the player, which grows downwards; `open` opens it at once. Only the standard size offers it, and only when the audio and the transcript are on show.fm. Absent, there is no button.'
	},
	strings: {
		type: 'Partial<Record<string, string>>',
		description:
			'Overrides for visible strings, by key, usually set as a property. `window.showfmStrings` sets them for every element.'
	}
};

/** @type {Record<string, string>} */
const PART_DESCRIPTIONS = {
	artwork: 'The episode artwork.',
	container: 'The player card.',
	controls: 'The transport controls row.',
	download: 'The download link.',
	error: 'The card shown when the episode cannot be played.',
	footer: 'The "Powered by" row.',
	mute: 'The mute button.',
	play: 'The play and pause button.',
	rate: 'The playback rate button.',
	seek: 'The seek slider.',
	share: 'The share button.',
	subtitle: 'The podcast title line.',
	title: 'The episode title link.',
	transcript: 'The Transcript button.'
};

/**
 * <showfm-episodes>. `style` (an undocumented alias for `variant`) and `lang`
 * (a global attribute) are read too but not listed.
 * @type {Record<string, { type: string, default?: string, description: string }>}
 */
const LIST_ATTRIBUTES = {
	podcast: {
		type: 'string',
		description: 'Podcast UUID (preferred, it survives a slug change) or slug.'
	},
	variant: {
		type: "'card' | 'minimal'",
		default: "'card'",
		description: 'Card shows artwork and descriptions; Minimal is a quieter text list.'
	},
	layout: {
		type: "'auto' | 'list' | 'grid' | 'compact'",
		default: "'auto'",
		description:
			'`auto` is a grid from 900px wide (for Card, when at least half the episodes have their own artwork), else a list. A grid under 480px wide shows as a list.'
	},
	count: {
		type: 'number',
		default: '10',
		description: 'Episodes per page, 1 to 50. "Load more" fetches the next page.'
	},
	season: { type: 'number', description: 'Only this season.' },
	hide: {
		type: 'string',
		description: 'Episode types to leave out: `trailer`, `bonus` or `trailer,bonus`.'
	},
	descriptions: {
		type: "'on' | 'off'",
		default: "'on'",
		description: 'Episode descriptions, two lines with "More" in the list layout.'
	},
	'mini-player': {
		type: "'on' | 'off'",
		default: "'off'",
		description: "`on`: playing a row opens the page's mini-player."
	},
	'heading-level': ATTRIBUTES['heading-level'],
	credit: ATTRIBUTES.credit,
	load: {
		type: "'click'",
		description:
			"`click` requests nothing from show.fm, not even the list's code, until the facade the click loader draws is pressed. `showfm.load()` loads every facade at once."
	},
	theme: ATTRIBUTES.theme,
	accent: ATTRIBUTES.accent,
	api: ATTRIBUTES.api
};

/**
 * Read from the element that opens the mini-player (play-element.ts), not by
 * the element itself, so the element sources do not list it.
 */
const MINI_PLAYER_POSITION = 'mini-player-position';
const MINI_PLAYER_POSITION_ATTRIBUTE = {
	type: "'left' | 'right'",
	default: "'right'",
	description:
		'The corner the collapsed mini-player sits in, when this element opens it. `--showfm-bottom-offset` lifts it.'
};
LIST_ATTRIBUTES[MINI_PLAYER_POSITION] = MINI_PLAYER_POSITION_ATTRIBUTE;

/**
 * Set by the WordPress plugin; read by every element that can show the credit.
 * @type {{ type: string, default?: string, description: string }}
 */
const PLATFORM_ATTRIBUTE = {
	type: "'wordpress'",
	description:
		'For the show.fm WordPress plugin only, which passes `credit="off"` unless the site owner opts in: a credit in plugin code must be opt-in (WordPress.org guideline 10). With it, `credit="off"` hides "Powered by show.fm" for any show. Other sites should not set it.'
};
LIST_ATTRIBUTES.platform = PLATFORM_ATTRIBUTE;

/**
 * The player's attributes read from its host rather than declared as props
 * (each prop costs v1.js its accessors): `mini-player` by play-element.ts,
 * `mini-player-position` by the mini-player, `platform` by the player. They
 * have no property. Each must still appear in those sources.
 */
/** @type {Record<string, { type: string, default?: string, description: string }>} */
const PLAYER_HOST_ATTRIBUTES = {
	'mini-player': {
		type: "'on' | 'off'",
		default: "'off'",
		description:
			"`on`: when the visitor scrolls the player out of view while it plays, the page's mini-player takes over its audio, so playback carries on with seek, skip, speed and the time left. Off by default."
	},
	[MINI_PLAYER_POSITION]: MINI_PLAYER_POSITION_ATTRIBUTE,
	platform: PLATFORM_ATTRIBUTE
};
const PLAYER_HOST_SOURCES = [
	'src/lib/play-element.ts',
	'src/lib/MiniPlayer.svelte',
	'src/lib/ShowfmPlayer.svelte'
];

/**
 * <showfm-play>. `lang` (a global attribute) is read too but not listed.
 * @type {Record<string, { type: string, default?: string, description: string }>}
 */
const PLAY_ATTRIBUTES = {
	episode: ATTRIBUTES.episode,
	podcast: ATTRIBUTES.podcast,
	variant: {
		type: "'icon' | 'label' | 'link'",
		default: "'label'",
		description:
			'`icon` is a round button (for a table, say), `label` adds the episode length or time left, `link` is text inside a sentence.'
	},
	size: {
		type: "'sm' | 'lg'",
		default: "'sm'",
		description:
			'`sm` keeps a 40px line. `lg` is 48px (label) or 56px (icon). The link takes the text around it.'
	},
	'mini-player': {
		type: "'on' | 'off'",
		default: "'on'",
		description:
			'`on`: the first play opens the page\'s mini-player, with seek, skip, speed and the time left. `off`: visitors can only play and pause, and the button shows "Powered by show.fm" itself when the page\'s credit falls to it.'
	},
	[MINI_PLAYER_POSITION]: MINI_PLAYER_POSITION_ATTRIBUTE,
	credit: {
		type: "'auto' | 'on' | 'off'",
		default: "'auto'",
		description:
			'"Powered by show.fm" in the mini-player. `auto` and `off` hide it only when the show\'s plan includes branding removal and the show has turned it off; `on` always shows it. With `platform="wordpress"`, `off` hides it for any show. It shows once per page, so an embed above it that shows it wins.'
	},
	platform: PLATFORM_ATTRIBUTE,
	load: {
		type: "'click'",
		description:
			"`click` requests nothing from show.fm, not even the button's code, until the facade the click loader draws is pressed; then it loads and plays. `showfm.load()` loads every facade at once."
	},
	theme: ATTRIBUTES.theme,
	accent: ATTRIBUTES.accent,
	api: ATTRIBUTES.api
};

/** @type {Record<string, string>} */
const PLAY_PART_DESCRIPTIONS = {
	error: 'The message shown in place of the button (suspended, or cannot be played).',
	play: 'The button.'
};

/** @type {Record<string, string>} */
const LIST_PART_DESCRIPTIONS = {
	card: 'One episode: a row, a grid card or a compact row.',
	error: 'The message shown when the list cannot load or the show is suspended.',
	footer: 'The "Powered by" row.',
	play: "An episode's play and pause button.",
	title: "An episode's title link."
};

/**
 * <showfm-transcript>. `lang` (a global attribute) is read too but not listed.
 * @type {Record<string, { type: string, default?: string, description: string }>}
 */
const TRANSCRIPT_ATTRIBUTES = {
	episode: {
		type: 'string',
		description:
			"Episode UUID. Shows that episode's transcript, and follows along whenever it plays on the page. Without it, the transcript follows what plays."
	},
	for: {
		type: 'string',
		description:
			'The id of a `showfm-player` or `showfm-episodes` on the page: the transcript follows what it plays.'
	},
	height: {
		type: 'number',
		default: '320',
		description:
			'Height of the text area in pixels, 120 to 2000. The search row adds 55px, and the border 2px.'
	},
	'heading-level': {
		type: "'2' | '3' | '4' | '5' | '6'",
		description:
			'Makes the name "Transcript" a heading of this level. Absent, no heading is emitted.'
	},
	load: {
		type: "'click'",
		description:
			"`click` requests nothing from show.fm, not even the transcript's code, until `showfm.load()` runs. Until then its fallback text shows."
	},
	theme: ATTRIBUTES.theme,
	accent: ATTRIBUTES.accent,
	api: ATTRIBUTES.api
};

/** @type {Record<string, string>} */
const TRANSCRIPT_PART_DESCRIPTIONS = {
	card: 'The transcript panel.'
};

/**
 * The `--showfm-*` styling hooks (README "Styling hooks"; the names are
 * STYLE_HOOKS in src/lib/style-hooks.ts, which a test holds this to). `on`
 * says which elements read each; the mini-player takes those of the element
 * that opens it.
 * @type {{ name: string, syntax: string, default?: string, on: ('player' | 'episodes' | 'play' | 'transcript')[], description: string }[]}
 */
export const STYLE_HOOK_DESCRIPTIONS = [
	{
		name: '--showfm-accent',
		syntax: '<color>',
		on: ['player', 'episodes', 'play', 'transcript'],
		description:
			"The accent, one colour in. The fill (3:1 on the card and the tint), text in the accent (4.5:1), the colour on the fill, the tint and the glow are derived from it for light and dark. A pinned `accent` attribute wins over it; it wins over the show's colour."
	},
	{
		name: '--showfm-accent-text',
		syntax: '<color>',
		default: 'derived from the accent',
		on: ['player', 'episodes', 'play', 'transcript'],
		description:
			'Text and links in the accent. Darkened or lightened until it reaches 4.5:1 on the card, the tint and the controls.'
	},
	{
		name: '--showfm-surface',
		syntax: '<color>',
		default: "the theme's (#ffffff or #17151f)",
		on: ['player', 'episodes', 'play', 'transcript'],
		description:
			'The card background. The text colours are derived from it: it decides between dark and light text, whatever `theme` says. A mid-tone is lightened or darkened until text can reach 7:1 on it.'
	},
	{
		name: '--showfm-background',
		syntax: '<color>',
		default: 'var(--showfm-surface)',
		on: ['episodes', 'play'],
		description:
			"The page's colour behind elements with no card of their own (the Minimal list, the play button). Their text colours are derived from it."
	},
	{
		name: '--showfm-text',
		syntax: '<color>',
		on: ['player', 'episodes', 'play', 'transcript'],
		description:
			'Titles and body text. Adjusted until it reaches 4.5:1 on every surface it sits on.'
	},
	{
		name: '--showfm-muted',
		syntax: '<color>',
		on: ['player', 'episodes', 'play', 'transcript'],
		description:
			'Secondary text: dates, times, "Powered by". Adjusted until it reaches 4.5:1 on every surface it sits on.'
	},
	{
		name: '--showfm-border',
		syntax: '<color>',
		on: ['player', 'episodes', 'play', 'transcript'],
		description: 'Card borders and dividers. Decorative, so it is used as written.'
	},
	{
		name: '--showfm-wave',
		syntax: '<color>',
		on: ['player', 'episodes', 'play'],
		description: 'The unplayed waveform bars. Decorative, so it is used as written.'
	},
	{
		name: '--showfm-wave-played',
		syntax: '<color>',
		default: 'the accent fill',
		on: ['player', 'episodes', 'play'],
		description:
			'The played part of the waveform. Adjusted until it reaches 3:1 on the card and on the tint of a playing row.'
	},
	{
		name: '--showfm-focus',
		syntax: '<color>',
		default: 'the accent text',
		on: ['player', 'episodes', 'play', 'transcript'],
		description:
			'The keyboard focus ring. Adjusted until it reaches 3:1 on the card, the tint and the controls.'
	},
	{
		name: '--showfm-font',
		syntax: '<family-name>#',
		default: 'inherit',
		on: ['player', 'episodes', 'play', 'transcript'],
		description:
			"The font. Unset, every element uses the page's font. No font is ever downloaded; the player's heights hold in any font."
	},
	{
		name: '--showfm-font-title',
		syntax: '<family-name>#',
		default: 'var(--showfm-font)',
		on: ['player', 'episodes', 'play'],
		description: 'Episode titles only.'
	},
	{
		name: '--showfm-font-scale',
		syntax: '<number>',
		default: '1',
		on: ['episodes', 'transcript'],
		description:
			"Scales the list's type and the transcript's lines, 0.85 to 1.3. The player, the play button and the mini-player keep their sizes, which their fixed heights need."
	},
	{
		name: '--showfm-radius',
		syntax: '<length>',
		default: '14px',
		on: ['player', 'episodes', 'play', 'transcript'],
		description:
			"Corners of the cards, held to 0 to 28px. Artwork follows at 70%. Play buttons and pills stay round; on a play button it rounds the phone mini-player's bar and sheet."
	},
	{
		name: '--showfm-space',
		syntax: '<number>',
		default: '1',
		on: ['episodes'],
		description: "The list's spacing, 0.85 to 1.4, held there so tap targets keep their size."
	},
	{
		name: '--showfm-bottom-offset',
		syntax: '<length>',
		default: '0px',
		on: ['episodes', 'play'],
		description:
			'Lifts the mini-player this element opens above a cookie bar or chat bubble. Set it here or on the page.'
	},
	{
		name: '--showfm-height',
		syntax: '<length>',
		default: '0',
		on: ['episodes', 'transcript'],
		description:
			"The height to reserve before the element loads. A list keeps it as its minimum height; a transcript's fallback text scrolls inside it."
	}
];

/**
 * The hooks one element reads, for its manifest entry.
 * @param {'player' | 'episodes' | 'play' | 'transcript'} element
 */
function cssPropertiesOf(element) {
	return STYLE_HOOK_DESCRIPTIONS.filter((hook) => hook.on.includes(element)).map((hook) => ({
		name: hook.name,
		syntax: hook.syntax,
		...(hook.default ? { default: hook.default } : {}),
		description: hook.description
	}));
}

/**
 * Attribute names from the <svelte:options customElement> props block.
 * @param {string} source
 */
export function readAttributes(source) {
	const props = /props:\s*\{([\s\S]*?)\n\t\t\}/.exec(source);
	if (!props) throw new Error('No customElement props block in ShowfmPlayer.svelte');
	return [...props[1].matchAll(/attribute:\s*'([a-z-]+)'/g)].map((match) => match[1]);
}

/**
 * `part="..."` names in a component's markup, sorted and unique.
 * @param {string} source
 */
export function readParts(source) {
	return [...new Set([...source.matchAll(/\bpart="([a-z-]+)"/g)].map((m) => m[1]))].sort();
}

/**
 * Attribute names from a `NAME = [...]` list in an element's mount module
 * (EPISODE_LIST_ATTRIBUTES in episodes.svelte.ts, PLAY_ATTRIBUTES in
 * play.svelte.ts), without the ones not listed.
 * @param {string} source
 * @param {string} name
 */
export function readListAttributes(source, name = 'EPISODE_LIST_ATTRIBUTES') {
	const list = new RegExp(`${name} = \\[([\\s\\S]*?)\\]`).exec(source);
	if (!list) throw new Error(`No ${name} in the element's mount module`);
	return [...list[1].matchAll(/'([a-z-]+)'/g)]
		.map((match) => match[1])
		.filter((name) => name !== 'style' && name !== 'lang');
}

/**
 * The manifest's attributes for an element whose attributes are described here.
 * @param {string[]} names
 * @param {Record<string, { type: string, default?: string, description: string }>} described
 */
function attributesOf(names, described) {
	return names.map((name) => ({
		name,
		type: { text: described[name].type },
		...(described[name].default ? { default: described[name].default } : {}),
		description: described[name].description
	}));
}

/**
 * The manifest entry for one element, checked against its source.
 * @param {string[]} names
 * @param {string[]} parts
 * @param {Record<string, { type: string, default?: string, field?: string, description: string }>} described
 * @param {Record<string, string>} partDescriptions
 */
function checkDescribed(names, parts, described, partDescriptions) {
	for (const name of names) {
		if (!described[name]) throw new Error(`Attribute "${name}" has no description in cem.mjs`);
	}
	for (const name of Object.keys(described)) {
		if (!names.includes(name)) throw new Error(`cem.mjs describes "${name}", which is not a prop`);
	}
	for (const part of parts) {
		if (!partDescriptions[part]) throw new Error(`Part "${part}" has no description in cem.mjs`);
	}
}

export function buildManifest() {
	const player = readFileSync('src/lib/ShowfmPlayer.svelte', 'utf-8');
	const core = readFileSync('src/lib/PlayerCore.svelte', 'utf-8');

	const names = readAttributes(player);
	const parts = readParts(core);
	checkDescribed(names, parts, ATTRIBUTES, PART_DESCRIPTIONS);
	const listNames = readListAttributes(readFileSync('src/lib/episodes.svelte.ts', 'utf-8'));
	listNames.splice(listNames.indexOf('mini-player') + 1, 0, MINI_PLAYER_POSITION);
	const listParts = readParts(readFileSync('src/lib/EpisodeList.svelte', 'utf-8'));
	checkDescribed(listNames, listParts, LIST_ATTRIBUTES, LIST_PART_DESCRIPTIONS);
	const playNames = readListAttributes(
		readFileSync('src/lib/play.svelte.ts', 'utf-8'),
		'PLAY_ATTRIBUTES'
	);
	playNames.splice(playNames.indexOf('mini-player') + 1, 0, MINI_PLAYER_POSITION);
	const playParts = readParts(readFileSync('src/lib/PlayButton.svelte', 'utf-8'));
	checkDescribed(playNames, playParts, PLAY_ATTRIBUTES, PLAY_PART_DESCRIPTIONS);
	const transcriptNames = readListAttributes(
		readFileSync('src/lib/transcript.svelte.ts', 'utf-8'),
		'TRANSCRIPT_ATTRIBUTES'
	);
	const transcriptParts = readParts(readFileSync('src/lib/Transcript.svelte', 'utf-8'));
	checkDescribed(
		transcriptNames,
		transcriptParts,
		TRANSCRIPT_ATTRIBUTES,
		TRANSCRIPT_PART_DESCRIPTIONS
	);

	const hostSources = PLAYER_HOST_SOURCES.map((path) => readFileSync(path, 'utf-8')).join('\n');
	for (const name of Object.keys(PLAYER_HOST_ATTRIBUTES)) {
		if (!hostSources.includes(`'${name}'`)) throw new Error(`No source reads "${name}"`);
	}
	const attributes = [
		...names.map((name) => ({
			name,
			type: { text: ATTRIBUTES[name].type },
			...(ATTRIBUTES[name].default ? { default: ATTRIBUTES[name].default } : {}),
			description: ATTRIBUTES[name].description,
			fieldName: ATTRIBUTES[name].field ?? name
		})),
		...Object.entries(PLAYER_HOST_ATTRIBUTES).map(([name, described]) => ({
			name,
			type: { text: described.type },
			...(described.default ? { default: described.default } : {}),
			description: described.description
		}))
	];
	const members = names.map((name) => ({
		kind: 'field',
		name: ATTRIBUTES[name].field ?? name,
		type: { text: ATTRIBUTES[name].type },
		...(ATTRIBUTES[name].default ? { default: ATTRIBUTES[name].default } : {}),
		description: ATTRIBUTES[name].description,
		attribute: name
	}));
	const shared = {
		attributes,
		members,
		slots: [
			{
				name: '',
				description:
					'Fallback content: a title link and a plain audio control (renderEpisodeHTML). It shows before the element upgrades, without JavaScript, and when the episode cannot be played. A 404 hides it with the element.'
			}
		],
		cssProperties: cssPropertiesOf('player'),
		cssParts: parts.map((name) => ({ name, description: PART_DESCRIPTIONS[name] }))
	};

	return {
		schemaVersion: '2.1.0',
		readme: 'README.md',
		modules: [
			{
				kind: 'javascript-module',
				path: MODULE_PATH,
				declarations: [
					{
						kind: 'class',
						name: 'ShowfmPlayer',
						tagName: 'showfm-player',
						customElement: true,
						description:
							'The show.fm podcast player. Set `episode` to play one episode, or `podcast` to play the latest one.',
						...shared
					},
					{
						kind: 'class',
						name: 'PodcasterPlusPlayer',
						tagName: 'podcasterplus-player',
						customElement: true,
						description:
							'The pre-rebrand name of `showfm-player`. It stays registered so embeds already on the web keep working.',
						deprecated: 'Use `showfm-player`.',
						superclass: { name: 'ShowfmPlayer', module: MODULE_PATH },
						...shared
					},
					{
						kind: 'class',
						name: 'ShowfmEpisodes',
						tagName: 'showfm-episodes',
						customElement: true,
						description:
							"A podcast's episodes as a list or grid, each one playable. The list's code loads the first time one is on the page. Its fallback is a list of title links (renderEpisodeListHTML), which shows until the list mounts and without JavaScript. Set --showfm-height to the height to reserve; the list keeps it as its minimum and grows downwards only.",
						attributes: attributesOf(listNames, LIST_ATTRIBUTES),
						members: [
							{
								kind: 'field',
								name: 'strings',
								type: { text: ATTRIBUTES.strings.type },
								description: ATTRIBUTES.strings.description
							}
						],
						cssProperties: cssPropertiesOf('episodes'),
						cssParts: listParts.map((name) => ({ name, description: LIST_PART_DESCRIPTIONS[name] }))
					},
					{
						kind: 'class',
						name: 'ShowfmPlay',
						tagName: 'showfm-play',
						customElement: true,
						description:
							"A play button for one episode, as an icon, a labelled button or a link in a sentence. Every button on the page plays through the same page audio, and the first play opens the page's mini-player (a bar along the bottom of the window, a pill when collapsed, a sheet on phones) unless `mini-player` is `off`. Its code loads the first time one is on the page. Its fallback is a title link and a plain audio control (renderEpisodeHTML), which shows until the button mounts and without JavaScript.",
						attributes: attributesOf(playNames, PLAY_ATTRIBUTES),
						members: [
							{
								kind: 'field',
								name: 'strings',
								type: { text: ATTRIBUTES.strings.type },
								description: ATTRIBUTES.strings.description
							}
						],
						cssProperties: cssPropertiesOf('play'),
						cssParts: playParts.map((name) => ({ name, description: PLAY_PART_DESCRIPTIONS[name] }))
					},
					{
						kind: 'class',
						name: 'ShowfmTranscript',
						tagName: 'showfm-transcript',
						customElement: true,
						description:
							'The follow-along transcript: the line being spoken is highlighted (word by word when the transcript has word timings), a click on a line seeks, and the visitor can search it. It follows the episode in `episode`, the player or list named by `for`, or else whatever plays on the page. Its code loads the first time one is on the page. Its fallback is the transcript as paragraphs (renderTranscriptHTML), for search engines and visitors without JavaScript. Set --showfm-height to the height to reserve.',
						attributes: attributesOf(transcriptNames, TRANSCRIPT_ATTRIBUTES),
						members: [
							{
								kind: 'field',
								name: 'strings',
								type: { text: ATTRIBUTES.strings.type },
								description: ATTRIBUTES.strings.description
							}
						],
						cssProperties: cssPropertiesOf('transcript'),
						cssParts: transcriptParts.map((name) => ({
							name,
							description: TRANSCRIPT_PART_DESCRIPTIONS[name]
						}))
					}
				],
				exports: [
					{
						kind: 'custom-element-definition',
						name: 'showfm-player',
						declaration: { name: 'ShowfmPlayer', module: MODULE_PATH }
					},
					{
						kind: 'custom-element-definition',
						name: 'podcasterplus-player',
						declaration: { name: 'PodcasterPlusPlayer', module: MODULE_PATH }
					},
					{
						kind: 'custom-element-definition',
						name: 'showfm-episodes',
						declaration: { name: 'ShowfmEpisodes', module: MODULE_PATH }
					},
					{
						kind: 'custom-element-definition',
						name: 'showfm-play',
						declaration: { name: 'ShowfmPlay', module: MODULE_PATH }
					},
					{
						kind: 'custom-element-definition',
						name: 'showfm-transcript',
						declaration: { name: 'ShowfmTranscript', module: MODULE_PATH }
					}
				]
			}
		]
	};
}

// pathToFileURL encodes the path, so a checkout under a path with spaces still runs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const output = JSON.stringify(buildManifest(), null, '\t') + '\n';
	if (process.argv.includes('--check')) {
		if (readFileSync(OUTPUT, 'utf-8') !== output) {
			console.error(`${OUTPUT} is out of date. Run \`pnpm cem\` and commit the result.`);
			process.exit(1);
		}
		console.log(`${OUTPUT} is up to date.`);
	} else {
		writeFileSync(OUTPUT, output);
		console.log(`Wrote ${OUTPUT}.`);
	}
}
