import { describe, expect, it } from 'vitest';
import { isOnNpm, isTagOnRemote, releasePlan, tagName } from '../release-plan.mjs';

describe('releasePlan', () => {
	it('does nothing before the first version', () => {
		expect(releasePlan({ version: '0.0.0', onNpm: false, tagOnRemote: false })).toEqual({
			publish: false,
			tag: false
		});
	});

	it('publishes and tags a new version', () => {
		expect(releasePlan({ version: '1.0.0', onNpm: false, tagOnRemote: false })).toEqual({
			publish: true,
			tag: true
		});
	});

	it('never publishes twice, but still tags a version published by a run that stopped early', () => {
		expect(releasePlan({ version: '1.0.0', onNpm: true, tagOnRemote: false })).toEqual({
			publish: false,
			tag: true
		});
	});

	it('does nothing when the version is published and tagged', () => {
		expect(releasePlan({ version: '1.0.0', onNpm: true, tagOnRemote: true })).toEqual({
			publish: false,
			tag: false
		});
	});

	it('does not announce a tag that already exists', () => {
		expect(releasePlan({ version: '1.0.0', onNpm: false, tagOnRemote: true })).toEqual({
			publish: true,
			tag: false
		});
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
});
