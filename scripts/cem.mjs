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
			'The "Powered by show.fm" footer. `auto` follows the show\'s plan. It shows once per page, on the first embed that shows it.'
	},
	load: {
		type: "'click'",
		description:
			'`click` draws a facade and requests nothing from show.fm until the visitor presses it. `showfm.load()` loads every facade at once.'
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
	title: 'The episode title link.'
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
			"`on`: the first play opens the page's mini-player, with seek, skip, speed and the time left. `off`: visitors can only play and pause."
	},
	[MINI_PLAYER_POSITION]: MINI_PLAYER_POSITION_ATTRIBUTE,
	credit: {
		type: "'auto' | 'on' | 'off'",
		default: "'auto'",
		description:
			'"Powered by show.fm" in the mini-player. `auto` follows the show\'s plan. It shows once per page, so an embed above it that shows it wins.'
	},
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

	const attributes = names.map((name) => ({
		name,
		type: { text: ATTRIBUTES[name].type },
		...(ATTRIBUTES[name].default ? { default: ATTRIBUTES[name].default } : {}),
		description: ATTRIBUTES[name].description,
		fieldName: ATTRIBUTES[name].field ?? name
	}));
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
						cssProperties: [
							{
								name: '--showfm-height',
								description:
									'The height to reserve before the list loads. The list keeps it as its minimum height.',
								default: '0'
							}
						],
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
						cssProperties: [
							{
								name: '--showfm-bottom-offset',
								description:
									'Lifts the mini-player this button opens above a cookie bar or chat bubble. Set it here or on the page.',
								default: '0px'
							}
						],
						cssParts: playParts.map((name) => ({ name, description: PLAY_PART_DESCRIPTIONS[name] }))
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
					}
				]
			}
		]
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
