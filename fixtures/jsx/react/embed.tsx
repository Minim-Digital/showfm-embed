/**
 * Compile-only fixture: proves the published react typings make
 * <showfm-player> a typed JSX element. CI runs `pnpm jsx:check` after the
 * build, so the package resolves through its own exports map.
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

// @ts-expect-error credit is 'auto', 'on' or 'off'
export const wrongCredit = <showfm-player credit="maybe" />;
