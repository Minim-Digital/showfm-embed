/**
 * The element reference (docs/elements.md) against the manifest it is generated from.
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderElements } from '../elements-md.mjs';

interface Declaration {
	tagName?: string;
	attributes?: { name: string }[];
	cssProperties?: { name: string }[];
	cssParts?: { name: string }[];
}

const manifest = JSON.parse(readFileSync('custom-elements.json', 'utf-8')) as {
	modules: { declarations: Declaration[] }[];
};
const elements = manifest.modules.flatMap((module) =>
	module.declarations.filter((declaration) => declaration.tagName)
);
const markdown = renderElements(manifest);

/** The section for one element, up to the next element's heading. */
function sectionFor(tag: string): string {
	const start = markdown.indexOf(`\n## \`<${tag}>\`\n`);
	expect(start, `no section for <${tag}>`).toBeGreaterThan(-1);
	const next = markdown.indexOf('\n## ', start + 1);
	return markdown.slice(start, next === -1 ? undefined : next);
}

describe('element reference', () => {
	it('matches the committed docs/elements.md', () => {
		expect(readFileSync('docs/elements.md', 'utf-8')).toBe(markdown);
	});

	it('has every element with its attributes, CSS custom properties and parts', () => {
		expect(elements.length).toBeGreaterThanOrEqual(5);
		for (const element of elements) {
			const section = sectionFor(element.tagName!);
			for (const item of [
				...(element.attributes ?? []),
				...(element.cssProperties ?? []),
				...(element.cssParts ?? [])
			]) {
				expect(section, `<${element.tagName}> is missing ${item.name}`).toContain(
					`| \`${item.name}\` |`
				);
			}
		}
	});

	it('escapes pipes in union types, so a row keeps its four cells', () => {
		const row = sectionFor('showfm-player')
			.split('\n')
			.find((line) => line.startsWith('| `theme` |'))!;
		expect(row).toContain("`'auto' \\| 'light' \\| 'dark'`");
		expect(row.split(/(?<!\\)\|/).length).toBe(6);
	});

	it('marks the deprecated alias', () => {
		expect(sectionFor('podcasterplus-player')).toContain('**Deprecated.**');
	});
});
