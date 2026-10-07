/**
 * The publish step of the release workflow (run by changesets/action).
 *
 * changesets/action runs this on every push to main that has no pending
 * changesets, so it must do nothing when the current version is already on
 * npm. Otherwise it builds, publishes with npm (trusted publishing over
 * OIDC, with provenance), and prints the "New tag:" line the action reads to
 * create the git tag and GitHub release.
 *
 * npm is called directly, not through `changeset publish`, because that
 * delegates to `pnpm publish` in a pnpm project, and trusted publishing is an
 * npm CLI feature (npm 11.5.1 or later).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { name, version } = JSON.parse(readFileSync('package.json', 'utf-8'));

if (version === '0.0.0') {
	console.log(`${name} is still 0.0.0; nothing to publish.`);
	process.exit(0);
}

const view = spawnSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf-8' });
if (view.status === 0 && view.stdout.trim() === version) {
	console.log(`${name}@${version} is already on npm; nothing to publish.`);
	process.exit(0);
}

execFileSync('pnpm', ['build'], { stdio: 'inherit' });
execFileSync('npm', ['publish', '--provenance', '--access', 'public'], { stdio: 'inherit' });
// Prints "New tag: @showfm/embed@x.y.z" and creates the tag locally.
execFileSync('pnpm', ['changeset', 'tag'], { stdio: 'inherit' });
