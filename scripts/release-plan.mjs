/**
 * What a release run should do, decided from facts gathered by
 * scripts/publish.mjs. Kept pure so the decision is unit tested.
 *
 * The invariant: never publish a version twice, and never leave a published
 * version without its git tag. A run can stop after `npm publish` succeeds
 * but before the tag and GitHub release exist (a failed `changeset tag`, a
 * failed release call). The re-run then finds the version on npm, so it must
 * skip the publish but still announce the tag, which makes changesets/action
 * push the tag and create the release.
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
 * @param {{ version: string, onNpm: boolean, tagOnRemote: boolean }} facts
 * @returns {{ publish: boolean, tag: boolean }}
 */
export function releasePlan({ version, onNpm, tagOnRemote }) {
	if (version === '0.0.0') return { publish: false, tag: false };
	return { publish: !onNpm, tag: !tagOnRemote };
}
