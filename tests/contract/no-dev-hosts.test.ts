// @vitest-environment node
/**
 * The package names no development host. The WordPress plugin bundles these
 * files and goes to WordPress.org, and every page that loads v1.js gets them,
 * so nothing under the show.fm development domain may be in what ships.
 * Staging pages add their media host at runtime with window.showfmMediaHosts.
 *
 * This reads every built file in dist/, plus the other files the package
 * ships (package.json "files"), so run `pnpm build` first.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

// Built from parts so this file does not itself name the domain.
const DEV_DOMAIN = ['showfm', 'dev'].join('.');
const DEV_HOST = new RegExp(DEV_DOMAIN.replace('.', '\\.'), 'i');

function filesUnder(path: string): string[] {
	if (!statSync(path).isDirectory()) return [path];
	return readdirSync(path).flatMap((name) => filesUnder(join(path, name)));
}

const DIST_FILES = filesUnder(resolve(ROOT, 'dist'));
const OTHER_SHIPPED = [
	...filesUnder(resolve(ROOT, 'custom-elements.json')),
	...filesUnder(resolve(ROOT, 'fixtures/fallback'))
];

const offenders = (files: string[]) =>
	files
		.filter((file) => DEV_HOST.test(readFileSync(file, 'latin1')))
		.map((file) => relative(ROOT, file));

describe('no development hosts in the package', () => {
	it('has a built dist/ to check', () => {
		expect(DIST_FILES.some((file) => file.endsWith(join('cdn', 'v1.js')))).toBe(true);
		expect(DIST_FILES.length).toBeGreaterThan(10);
	});

	it(`no file in dist/ contains ${DEV_DOMAIN}`, () => {
		expect(offenders(DIST_FILES)).toEqual([]);
	});

	it(`no other shipped file contains ${DEV_DOMAIN}`, () => {
		expect(offenders(OTHER_SHIPPED)).toEqual([]);
	});
});
