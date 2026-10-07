/**
 * What a release run should do, decided from facts gathered by
 * scripts/publish.mjs. Kept pure so the decision is unit tested.
 *
 * The invariant: never publish a version twice, and never leave a published
 * version without its git tag or its GitHub release. A run can stop at any
 * point after `npm publish` succeeds:
 *
 * - before the tag is pushed: the re-run finds the version on npm, skips the
 *   publish and announces the tag ("New tag:"), and changesets/action then
 *   pushes the tag and creates the release;
 * - after the tag is pushed but before the release is created: announcing
 *   the tag again would make the action push over an existing tag, so the
 *   re-run creates the missing release itself.
 */

/**
 * Changesets' tag name for a single-package repo.
 * @param {string} version
 */
export const tagName = (version) => `v${version}`;

/**
 * Whether `npm view <name>@<version> version` shows the version is published.
 * @param {{ status: number | null, stdout: string }} view
 * @param {string} version
 */
export const isOnNpm = (view, version) => view.status === 0 && view.stdout.trim() === version;

/**
 * Whether `git ls-remote --tags origin refs/tags/<tag>` found the tag.
 * @param {{ status: number | null, stdout: string }} lsRemote
 */
export function isTagOnRemote(lsRemote) {
	// Fail closed: if the remote cannot be asked, do not claim the tag is missing,
	// or the action would try to push a tag over an existing one.
	if (lsRemote.status !== 0) throw new Error('Could not list the remote tags.');
	return lsRemote.stdout.trim() !== '';
}

/**
 * Whether `gh release view <tag>` found the release.
 * @param {{ status: number | null, stderr: string }} view
 */
export function isReleaseOnGitHub(view) {
	if (view.status === 0) return true;
	if (/release not found/i.test(view.stderr)) return false;
	// Fail closed on anything else (auth, network): do not guess.
	throw new Error(`Could not check the GitHub release: ${view.stderr.trim()}`);
}

/**
 * @param {{ version: string, onNpm: boolean, tagOnRemote: boolean, releaseOnGitHub: boolean }} facts
 * @returns {{ publish: boolean, tag: boolean, release: boolean }}
 *   publish: run `npm publish`; tag: announce the tag so changesets/action
 *   pushes it and creates the release; release: create the release here,
 *   because the tag already exists.
 */
export function releasePlan({ version, onNpm, tagOnRemote, releaseOnGitHub }) {
	if (version === '0.0.0') return { publish: false, tag: false, release: false };
	return {
		publish: !onNpm,
		tag: !tagOnRemote,
		release: tagOnRemote && !releaseOnGitHub
	};
}

/**
 * The CHANGELOG.md entry for a version, as changesets/action reads it for a
 * release body: everything under the heading whose text is the version, up
 * to the next heading of the same depth, skipping fenced code blocks.
 * @param {string} changelog
 * @param {string} version
 */
export function changelogSection(changelog, version) {
	const lines = changelog.split('\n');
	let fence = '';
	let depth = 0;
	/** @type {string[]} */
	const body = [];
	for (const line of lines) {
		const fenceMatch = /^(`{3,})/.exec(line);
		if (fence) {
			if (line.startsWith(fence)) fence = '';
			if (depth) body.push(line);
			continue;
		}
		if (fenceMatch) {
			fence = fenceMatch[1];
			if (depth) body.push(line);
			continue;
		}
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading && !depth && heading[2].trim() === version) {
			depth = heading[1].length;
			continue;
		}
		if (heading && depth && heading[1].length <= depth) break;
		if (depth) body.push(line);
	}
	if (!depth) throw new Error(`CHANGELOG.md has no entry for ${version}.`);
	return body.join('\n').trim();
}
