/**
 * The publish step of the release workflow (run by changesets/action).
 *
 * changesets/action runs this on every push to main that has no pending
 * changesets. scripts/release-plan.mjs decides what to do:
 * - publish only when the version is not on npm yet, with npm (trusted
 *   publishing over OIDC, with provenance);
 * - announce the tag (`changeset tag` prints the "New tag:" line the action
 *   reads to push the tag and create the GitHub release) only when the tag
 *   is missing on the remote;
 * - create the GitHub release here when the tag exists but the release does
 *   not (a run that stopped between the two), with `gh` and the workflow's
 *   GITHUB_TOKEN.
 *
 * npm is called directly, not through `changeset publish`, because that
 * delegates to `pnpm publish` in a pnpm project, and trusted publishing is an
 * npm CLI feature (npm 11.5.1 or later).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
	changelogSection,
	isOnNpm,
	isReleaseOnGitHub,
	isTagOnRemote,
	releasePlan,
	tagName
} from './release-plan.mjs';

const { name, version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const tag = tagName(version);
// gh infers the repository from the git remote; in Actions, name it exactly.
const repo = process.env.GITHUB_REPOSITORY ? ['--repo', process.env.GITHUB_REPOSITORY] : [];

const onNpm = isOnNpm(
	spawnSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf-8' }),
	version
);
const tagOnRemote = isTagOnRemote(
	spawnSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], { encoding: 'utf-8' })
);
// The release only matters once the tag exists; before that the action creates it.
const releaseOnGitHub =
	tagOnRemote &&
	isReleaseOnGitHub(spawnSync('gh', ['release', 'view', tag, ...repo], { encoding: 'utf-8' }));

const plan = releasePlan({ version, onNpm, tagOnRemote, releaseOnGitHub });
console.log(
	`${name}@${version}: publish ${plan.publish ? 'yes' : 'no'}, tag ${tag} ${plan.tag ? 'yes' : 'no'}, ` +
		`create release here ${plan.release ? 'yes' : 'no'}.`
);

if (plan.publish) {
	execFileSync('pnpm', ['build'], { stdio: 'inherit' });
	execFileSync('npm', ['publish', '--provenance', '--access', 'public'], { stdio: 'inherit' });
}
if (plan.tag) {
	// Creates the tag locally and prints "New tag: v<version>".
	execFileSync('pnpm', ['changeset', 'tag'], { stdio: 'inherit' });
}
if (plan.release) {
	// The same release changesets/action would have made: named after the tag,
	// with the CHANGELOG entry as its notes.
	const notes = changelogSection(readFileSync('CHANGELOG.md', 'utf-8'), version);
	execFileSync(
		'gh',
		[
			'release',
			'create',
			tag,
			...repo,
			'--verify-tag',
			'--title',
			tag,
			'--notes',
			notes,
			...(version.includes('-') ? ['--prerelease'] : [])
		],
		{ stdio: 'inherit' }
	);
}
