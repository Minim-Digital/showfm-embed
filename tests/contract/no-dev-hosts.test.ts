// @vitest-environment node
/**
 * The package names no development host. The WordPress plugin bundles these
 * files and goes to WordPress.org, and every page that loads v1.js gets them,
 * so nothing under a show.fm development domain may be in what ships.
 * A staging page can add its media host at runtime with window.showfmMediaHosts.
 *
 * This reads every built file in dist/, and every file `npm pack` would
 * publish, so run `pnpm build` first.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

// Built from parts so this file does not itself name the domains.
const DEV_DOMAINS = [['showfm', 'dev'].join('.'), ['podcasterplus', 'dev'].join('.')];
const DEV_DOMAIN = DEV_DOMAINS.join(' or ');
const DEV_HOST = new RegExp(DEV_DOMAINS.map((d) => d.replace('.', '\\.')).join('|'), 'i');

function filesUnder(path: string): string[] {
	if (!statSync(path).isDirectory()) return [path];
	return readdirSync(path).flatMap((name) => filesUnder(join(path, name)));
}

const DIST_FILES = filesUnder(resolve(ROOT, 'dist'));

// Exactly what npm would publish, so a file added to "files" or one npm
// always includes (README, LICENSE, package.json) is checked too.
const PACKED: string[] = JSON.parse(
	execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
		cwd: ROOT,
		encoding: 'utf8'
	})
)[0].files.map((file: { path: string }) => resolve(ROOT, file.path));

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

	it(`no file npm would publish contains ${DEV_DOMAIN}`, () => {
		expect(PACKED.some((file) => file.endsWith('package.json'))).toBe(true);
		expect(offenders(PACKED)).toEqual([]);
	});
});
