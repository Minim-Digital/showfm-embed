/**
 * Generates docs/elements.md, the element reference, from custom-elements.json.
 *
 *   node scripts/elements-md.mjs           write the reference
 *   node scripts/elements-md.mjs --check   fail if the committed reference is stale
 *
 * The manifest is the source: scripts/cem.mjs builds it from the components and
 * `pnpm cem:check` keeps it current, so this file only renders it. Run `pnpm cem`
 * first when an attribute changes, then `pnpm elements`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const MANIFEST = 'custom-elements.json';
const OUTPUT = 'docs/elements.md';

const MINI_PLAYER_EVENT = 'showfm:mini-player';

/**
 * Events the elements dispatch. The manifest declares none, so this list is the source:
 * scripts/__tests__/elements-md.test.ts fails if src/ dispatches an event that is not here,
 * or this names one src/ no longer dispatches. Events are not part of the v1 contract
 * (CONTRIBUTING), so the reference says they may change.
 * @type {Record<string, { name: string, type: string, description: string }[]>}
 */
export const EVENTS = {
	'showfm-player': [
		{
			name: MINI_PLAYER_EVENT,
			type: 'CustomEvent<HTMLAudioElement>',
			description:
				'Fired each time the player starts playing; bubbles and is composed. `detail` is its audio element. The page\'s mini-player listens for it to take that audio over when the player has `mini-player="on"` and scrolls out of view.'
		}
	],
	'showfm-episodes': [
		{
			name: MINI_PLAYER_EVENT,
			type: 'CustomEvent',
			description:
				'Fired when a row starts playing and the list has `mini-player="on"`; bubbles and is composed. It opens the page\'s mini-player.'
		}
	],
	'showfm-play': [
		{
			name: MINI_PLAYER_EVENT,
			type: 'CustomEvent',
			description:
				"Fired when the button starts playing with `mini-player` on (the default); bubbles and is composed. It opens the page's mini-player."
		}
	],
	'showfm-transcript': [
		{
			name: 'close',
			type: 'Event',
			description:
				'Fired when its Close button is pressed. The button shows only with `data-showfm-close`, which the episode list sets on the transcript panel it opens under a grid row.'
		}
	]
};
// The deprecated alias is the player.
EVENTS['podcasterplus-player'] = EVENTS['showfm-player'];

/** Events dispatched on `document` rather than by an element. */
export const PAGE_EVENTS = [
	{
		name: 'showfm:load',
		type: 'Event',
		description:
			'Dispatched on `document` by `showfm.load()` (from `v1.js` or the click loader). Every `load="click"` element that has not loaded yet loads.'
	}
];

/**
 * The parts of a Custom Elements Manifest 2.1.0 declaration this renders.
 * @typedef {{ name: string, description?: string, type?: { text: string }, default?: string, syntax?: string, fieldName?: string, attribute?: string, kind?: string }} Item
 * @typedef {{ tagName?: string, description?: string, deprecated?: boolean | string, attributes?: Item[], members?: Item[], events?: Item[], slots?: Item[], cssProperties?: Item[], cssParts?: Item[] }} Declaration
 * @typedef {{ modules: { declarations?: Declaration[] }[] }} Manifest
 */

/**
 * A table cell: one line, with pipes escaped so they never split the cell.
 * @param {string | undefined} text
 */
function cell(text) {
	return String(text ?? '')
		.replace(/\s*\n\s*/g, ' ')
		.replace(/\|/g, '\\|')
		.trim();
}

/**
 * Inline code for a cell, or a dash when there is no value.
 * @param {string | undefined} text
 */
function code(text) {
	return text ? `\`${cell(text)}\`` : '-';
}

/**
 * @param {string[]} headings
 * @param {string[][]} rows
 */
function table(headings, rows) {
	return [
		`| ${headings.join(' | ')} |`,
		`| ${headings.map(() => '---').join(' | ')} |`,
		...rows.map((row) => `| ${row.join(' | ')} |`)
	].join('\n');
}

/**
 * @param {string} title
 * @param {string[][]} rows
 * @param {string[]} headings
 * @param {string} empty
 */
function section(title, rows, headings, empty) {
	return [`### ${title}`, '', rows.length ? table(headings, rows) : empty].join('\n');
}

/** @param {Declaration} declaration */
function renderElement(declaration) {
	const attributes = declaration.attributes ?? [];
	const attributeNames = new Set(
		attributes.map((attribute) => attribute.fieldName ?? attribute.name)
	);
	// Properties with no attribute of their own (such as `strings` on the lazy elements).
	const properties = (declaration.members ?? []).filter(
		(member) => member.kind === 'field' && !member.attribute && !attributeNames.has(member.name)
	);
	const parts = [`## \`<${declaration.tagName}>\``, ''];
	if (declaration.deprecated) {
		const instead = typeof declaration.deprecated === 'string' ? ` ${declaration.deprecated}` : '';
		parts.push(`**Deprecated.**${instead}`, '');
	}
	if (declaration.description) parts.push(declaration.description, '');
	parts.push(
		section(
			'Attributes',
			attributes.map((attribute) => [
				code(attribute.name),
				code(attribute.type?.text),
				code(attribute.default),
				cell(attribute.description)
			]),
			['Attribute', 'Type', 'Default', 'Description'],
			'None.'
		),
		''
	);
	if (properties.length) {
		parts.push(
			section(
				'Properties without an attribute',
				properties.map((property) => [
					code(property.name),
					code(property.type?.text),
					cell(property.description)
				]),
				['Property', 'Type', 'Description'],
				'None.'
			),
			''
		);
	}
	parts.push(
		section(
			'Events',
			[
				...(declaration.events ?? []).map((event) => [
					code(event.name),
					code(event.type?.text),
					cell(event.description)
				]),
				...(EVENTS[declaration.tagName ?? ''] ?? []).map((event) => [
					code(event.name),
					code(event.type),
					cell(event.description)
				])
			],
			['Event', 'Type', 'Description'],
			'None.'
		),
		'',
		section(
			'Slots',
			(declaration.slots ?? []).map((slot) => [
				slot.name ? code(slot.name) : '(default)',
				cell(slot.description)
			]),
			['Slot', 'Description'],
			'None.'
		),
		'',
		section(
			'CSS custom properties',
			(declaration.cssProperties ?? []).map((property) => [
				code(property.name),
				code(property.syntax),
				code(property.default),
				cell(property.description)
			]),
			['Property', 'Syntax', 'Default', 'Description'],
			'None.'
		),
		'',
		section(
			'CSS parts',
			(declaration.cssParts ?? []).map((part) => [code(part.name), cell(part.description)]),
			['Part', 'Description'],
			'None.'
		)
	);
	return parts.join('\n');
}

/**
 * The reference as Markdown, from a parsed Custom Elements Manifest.
 * @param {Manifest} manifest
 */
export function renderElements(manifest) {
	const declarations = manifest.modules.flatMap((module) =>
		(module.declarations ?? []).filter((declaration) => declaration.tagName)
	);
	return (
		[
			'# Element reference',
			'',
			'<!-- Generated by scripts/elements-md.mjs from custom-elements.json. Do not edit by hand: run `pnpm elements`. -->',
			'',
			'Every element, attribute, event, slot, CSS custom property and part that `@showfm/embed` registers, generated from [`custom-elements.json`](../custom-elements.json). The [README](../README.md) explains how they behave together.',
			'',
			"`lang` is the global HTML attribute, so it is not listed per element: every element reads its own `lang`, else the page's `<html lang>`, for its strings.",
			'',
			"The events are how the elements work with the page's mini-player and with each other. They are not part of the v1 contract (see [CONTRIBUTING](../CONTRIBUTING.md)), so they may change in a minor release.",
			'',
			...declarations.map(
				(declaration) => `- [\`<${declaration.tagName}>\`](#${declaration.tagName})`
			),
			'',
			declarations.map(renderElement).join('\n\n'),
			'',
			'## Page events',
			'',
			table(
				['Event', 'Type', 'Description'],
				PAGE_EVENTS.map((event) => [code(event.name), code(event.type), cell(event.description)])
			)
		].join('\n') + '\n'
	);
}

// pathToFileURL encodes the path, so a checkout under a path with spaces still runs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const output = renderElements(JSON.parse(readFileSync(MANIFEST, 'utf-8')));
	if (process.argv.includes('--check')) {
		let committed = '';
		try {
			committed = readFileSync(OUTPUT, 'utf-8');
		} catch {
			// A missing file is stale too.
		}
		if (committed !== output) {
			console.error(`${OUTPUT} is out of date. Run \`pnpm elements\` and commit the result.`);
			process.exit(1);
		}
		console.log(`${OUTPUT} is up to date.`);
	} else {
		mkdirSync(dirname(OUTPUT), { recursive: true });
		writeFileSync(OUTPUT, output);
		console.log(`Wrote ${OUTPUT}.`);
	}
}
