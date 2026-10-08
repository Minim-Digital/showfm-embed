/**
 * Compile-only fixture: proves the published react typings make
 * <showfm-player>, <showfm-episodes>, <showfm-play> and <showfm-transcript> typed JSX
 * elements.
 * CI runs `pnpm jsx:check` after the build, so the package resolves through
 * its own exports map.
 */
import type {} from '@showfm/embed/jsx-react';
import { PLAYER_MIN_HEIGHTS } from '@showfm/embed';

export const episode = (
	<showfm-player
		episode="11111111-2222-4333-8444-555555555555"
		size="compact"
		theme="dark"
		accent="#0ea5e9"
		wave="false"
		style={{ display: 'block', minHeight: `${PLAYER_MIN_HEIGHTS.compact.branded}px` }}
	>
		<a href="https://show.fm/">Listen on show.fm</a>
	</showfm-player>
);

export const latest = <podcasterplus-player podcast="test-signal" />;

// @ts-expect-error size is 'standard' or 'compact'
export const wrongSize = <showfm-player size="huge" />;

export const consent = (
	<showfm-player
		episode="11111111-2222-4333-8444-555555555555"
		heading-level="3"
		credit="off"
		load="click"
		lang="de"
	/>
);

// The page's mini-player takes over when the player scrolls out of view (1.6).
export const handOff = (
	<showfm-player
		episode="11111111-2222-4333-8444-555555555555"
		mini-player="on"
		mini-player-position="left"
	/>
);

// @ts-expect-error mini-player is 'on' or 'off'
export const wrongMiniPlayer = <showfm-player mini-player="yes" />;

// @ts-expect-error credit is 'auto', 'on' or 'off'
export const wrongCredit = <showfm-player credit="maybe" />;

export const episodes = (
	<showfm-episodes
		podcast="test-signal"
		variant="minimal"
		layout="grid"
		count={20}
		season="2"
		hide="trailer,bonus"
		descriptions="off"
		mini-player="on"
		mini-player-position="left"
		heading-level="3"
		load="click"
	>
		<ul>
			<li>
				<a href="https://show.fm/">Episode one</a>
			</li>
		</ul>
	</showfm-episodes>
);

// @ts-expect-error layout is 'auto', 'list', 'grid' or 'compact'
export const wrongLayout = <showfm-episodes podcast="test-signal" layout="tiles" />;

export const play = (
	<showfm-play
		episode="11111111-2222-4333-8444-555555555555"
		variant="icon"
		size="lg"
		mini-player="on"
		mini-player-position="left"
		credit="auto"
		load="click"
		lang="fr"
	>
		<a href="https://show.fm/">Episode one</a>
	</showfm-play>
);

// @ts-expect-error variant is 'icon', 'label' or 'link'
export const wrongVariant = <showfm-play episode="x" variant="pill" />;

export const withTranscript = (
	<showfm-player episode="11111111-2222-4333-8444-555555555555" transcript="open" />
);

export const transcript = (
	<showfm-transcript
		episode="11111111-2222-4333-8444-555555555555"
		for="player"
		height={400}
		heading-level="3"
		theme="dark"
		load="click"
	>
		<div>
			<p>
				<strong>Maya:</strong> So the bakery had been closed.
			</p>
		</div>
	</showfm-transcript>
);

// @ts-expect-error transcript is 'on' or 'open'
export const wrongTranscript = <showfm-player transcript="yes" />;
