/**
 * The publish step of the release workflow (run by changesets/action).
 *
 * changesets/action runs this on every push to main that has no pending
 * changesets. scripts/release-plan.mjs decides what to do:
 * - publish only when the version is not on npm yet, with npm (trusted
 *   publishing over OIDC, with provenance);
 * - announce the tag (`changeset tag` prints the "New tag:" line the action
 *   reads to push the tag and create the GitHub release) only when the tag
 *   is missing on the remote. This also repairs a run that published but
 *   stopped before tagging.
 *
 * npm is called directly, not through `changeset publish`, because that
 * delegates to `pnpm publish` in a pnpm project, and trusted publishing is an
 * npm CLI feature (npm 11.5.1 or later).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isOnNpm, isTagOnRemote, releasePlan, tagName } from './release-plan.mjs';

const { name, version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const tag = tagName(version);

const npmView = spawnSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf-8' });
const lsRemote = spawnSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], {
	encoding: 'utf-8'
});
const plan = releasePlan({
	version,
	onNpm: isOnNpm(npmView, version),
	tagOnRemote: isTagOnRemote(lsRemote)
});
console.log(
	`${name}@${version}: publish ${plan.publish ? 'yes' : 'no'}, tag ${tag} ${plan.tag ? 'yes' : 'no'}.`
);

if (plan.publish) {
	execFileSync('pnpm', ['build'], { stdio: 'inherit' });
	execFileSync('npm', ['publish', '--provenance', '--access', 'public'], { stdio: 'inherit' });
}
if (plan.tag) {
	// Creates the tag locally and prints "New tag: v<version>".
	execFileSync('pnpm', ['changeset', 'tag'], { stdio: 'inherit' });
}
