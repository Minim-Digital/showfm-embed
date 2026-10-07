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

/** @type {Record<string, { type: string, default?: string, description: string }>} */
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

export function buildManifest() {
	const player = readFileSync('src/lib/ShowfmPlayer.svelte', 'utf-8');
	const core = readFileSync('src/lib/PlayerCore.svelte', 'utf-8');

	const names = readAttributes(player);
	const parts = readParts(core);
	for (const name of names) {
		if (!ATTRIBUTES[name]) throw new Error(`Attribute "${name}" has no description in cem.mjs`);
	}
	for (const name of Object.keys(ATTRIBUTES)) {
		if (!names.includes(name)) throw new Error(`cem.mjs describes "${name}", which is not a prop`);
	}
	for (const part of parts) {
		if (!PART_DESCRIPTIONS[part]) throw new Error(`Part "${part}" has no description in cem.mjs`);
	}

	const attributes = names.map((name) => ({
		name,
		type: { text: ATTRIBUTES[name].type },
		...(ATTRIBUTES[name].default ? { default: ATTRIBUTES[name].default } : {}),
		description: ATTRIBUTES[name].description,
		fieldName: name
	}));
	const members = names.map((name) => ({
		kind: 'field',
		name,
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
					'Fallback content, such as a "Listen on show.fm" link. It shows when the episode cannot be loaded.'
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
