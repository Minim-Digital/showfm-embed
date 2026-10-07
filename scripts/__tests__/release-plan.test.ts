import { describe, expect, it } from 'vitest';
import {
	changelogSection,
	isOnNpm,
	isReleaseOnGitHub,
	isTagOnRemote,
	releasePlan,
	tagName
} from '../release-plan.mjs';

const plan = (onNpm: boolean, tagOnRemote: boolean, releaseOnGitHub: boolean, version = '1.0.0') =>
	releasePlan({ version, onNpm, tagOnRemote, releaseOnGitHub });

describe('releasePlan: the four states a release passes through', () => {
	it('nothing yet: publish, then announce the tag (the action pushes it and creates the release)', () => {
		expect(plan(false, false, false)).toEqual({ publish: true, tag: true, release: false });
	});

	it('on npm only: never publish twice, announce the missing tag', () => {
		expect(plan(true, false, false)).toEqual({ publish: false, tag: true, release: false });
	});

	it('on npm and tagged, no release: do not re-announce the tag, create the release here', () => {
		expect(plan(true, true, false)).toEqual({ publish: false, tag: false, release: true });
	});

	it('on npm, tagged and released: nothing to do', () => {
		expect(plan(true, true, true)).toEqual({ publish: false, tag: false, release: false });
	});
});

describe('releasePlan: other cases', () => {
	it('does nothing before the first version', () => {
		expect(plan(false, false, false, '0.0.0')).toEqual({
			publish: false,
			tag: false,
			release: false
		});
	});

	it('a tag pushed by hand before publishing: publish and create the release, no new tag', () => {
		expect(plan(false, true, false)).toEqual({ publish: true, tag: false, release: true });
	});
});

describe('facts', () => {
	it('uses the Changesets tag name for a single-package repo', () => {
		expect(tagName('1.2.3')).toBe('v1.2.3');
	});

	it('reads npm view: only an exact version match counts as published', () => {
		expect(isOnNpm({ status: 0, stdout: '1.0.0\n' }, '1.0.0')).toBe(true);
		expect(isOnNpm({ status: 1, stdout: '' }, '1.0.0')).toBe(false);
		expect(isOnNpm({ status: 0, stdout: '' }, '1.0.0')).toBe(false);
	});

	it('reads git ls-remote, and fails closed when the remote cannot be asked', () => {
		expect(isTagOnRemote({ status: 0, stdout: 'abc123\trefs/tags/v1.0.0\n' })).toBe(true);
		expect(isTagOnRemote({ status: 0, stdout: '' })).toBe(false);
		expect(() => isTagOnRemote({ status: 128, stdout: '' })).toThrow();
	});

	it('reads gh release view, and fails closed on anything but "release not found"', () => {
		expect(isReleaseOnGitHub({ status: 0, stderr: '' })).toBe(true);
		expect(isReleaseOnGitHub({ status: 1, stderr: 'release not found\n' })).toBe(false);
		expect(() => isReleaseOnGitHub({ status: 1, stderr: 'HTTP 401: Bad credentials' })).toThrow();
	});
});

describe('changelogSection', () => {
	const changelog = [
		'# @showfm/embed',
		'',
		'## 1.1.0',
		'',
		'### Minor Changes',
		'',
		'- Adds the episode list.',
		'',
		'```md',
		'## 1.0.0',
		'```',
		'',
		'## 1.0.0',
		'',
		'### Major Changes',
		'',
		'- First release.',
		''
	].join('\n');

	it('returns the entry up to the next heading of the same depth, skipping code blocks', () => {
		expect(changelogSection(changelog, '1.1.0')).toBe(
			'### Minor Changes\n\n- Adds the episode list.\n\n```md\n## 1.0.0\n```'
		);
	});

	it('returns the last entry up to the end of the file', () => {
		expect(changelogSection(changelog, '1.0.0')).toBe('### Major Changes\n\n- First release.');
	});

	it('throws when the version has no entry', () => {
		expect(() => changelogSection(changelog, '2.0.0')).toThrow(/no entry for 2.0.0/);
	});
});
