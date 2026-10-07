/**
 * The Custom Elements Manifest against the places that describe the same
 * attributes: each lazy element's own list and the README's table. An
 * attribute an element supports (such as `load`) must reach all of them.
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildManifest } from '../cem.mjs';
import { STYLE_HOOKS } from '../../src/lib/style-hooks';

interface Declaration {
	tagName: string;
	attributes?: { name: string }[];
}

const manifest = buildManifest() as { modules: { declarations: Declaration[] }[] };
const declaration = (tag: string) =>
	manifest.modules[0].declarations.find((entry) => entry.tagName === tag)!;
const names = (tag: string) => declaration(tag).attributes!.map((attribute) => attribute.name);

/** Attribute names in the README table that follows `heading`. */
function readmeAttributes(heading: string): string[] {
	const readme = readFileSync('README.md', 'utf-8');
	const section = readme.slice(readme.indexOf(`\n## ${heading}\n`));
	const table = section.slice(section.indexOf('| Attribute'));
	const rows = table.slice(0, table.indexOf('\n\n')).split('\n').slice(2);
	return rows.map((row) => /^\|\s*`([a-z-]+)`/.exec(row)![1]);
}

describe('<showfm-transcript> in the manifest', () => {
	it('lists load="click", which the element supports', () => {
		expect(names('showfm-transcript')).toContain('load');
	});

	it('lists what the README documents, lang aside (a global attribute)', () => {
		expect(names('showfm-transcript')).toEqual(
			readmeAttributes('The transcript').filter((name) => name !== 'lang')
		);
	});
});

describe('every lazy element', () => {
	it.each(['showfm-episodes', 'showfm-play', 'showfm-transcript'])('%s lists load', (tag) => {
		expect(names(tag)).toContain('load');
	});
});

describe('the styling hooks', () => {
	const hooksOf = (tag: string) =>
		(declaration(tag) as Declaration & { cssProperties: { name: string }[] }).cssProperties.map(
			(property) => property.name
		);
	const tags = ['showfm-player', 'showfm-episodes', 'showfm-play', 'showfm-transcript'];

	it('every hook is in the manifest, on the elements that read it', () => {
		expect([...new Set(tags.flatMap(hooksOf))].sort()).toEqual([...STYLE_HOOKS].sort());
		expect(hooksOf('podcasterplus-player')).toEqual(hooksOf('showfm-player'));
		for (const tag of tags) expect(hooksOf(tag)).toContain('--showfm-accent');
	});

	it('every hook is in the README table, and nothing else', () => {
		const readme = readFileSync('README.md', 'utf-8');
		const section = readme.slice(readme.indexOf('\n## Styling hooks\n'));
		const table = section.slice(section.indexOf('| Hook'));
		const rows = table.slice(0, table.indexOf('\n\n')).split('\n').slice(2);
		expect(rows.map((row) => /^\|\s*`(--showfm-[a-z-]+)`/.exec(row)![1]).sort()).toEqual(
			[...STYLE_HOOKS].sort()
		);
	});
});
