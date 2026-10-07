/**
 * The slice of the public API's episode payload the player consumes
 * (GET /v1/episodes/{id} → data). Kept structural so the player works with
 * both API responses and app-side data mapped into the same shape.
 */
export interface PlayerEpisodeData {
	id: string;
	title: string;
	published_at: string;
	audio: {
		url: string | null;
		content_type: string | null;
		duration_seconds: number | null;
	};
	artwork: { url: string | null };
	links: { listen: string };
	podcast: {
		title: string;
		brand_color: string | null;
		/**
		 * The show's player-color setting (Distribution settings). Optional:
		 * payloads cached before the field shipped won't carry it.
		 */
		player_color?: string | null;
		/**
		 * The show's player-theme default (Distribution settings) — what an
		 * embed without a pinned theme attribute follows. Optional: payloads
		 * cached before the field shipped won't carry it (treated as 'auto').
		 */
		player_theme?: string | null;
		/**
		 * The show's waveform default (Distribution settings) — what an embed
		 * without a pinned wave attribute follows. Optional: payloads cached
		 * before the field shipped won't carry it (treated as true).
		 */
		player_waveform?: boolean | null;
		branding: { show_powered_by: boolean };
	};
}

export type PlayerTheme = 'auto' | 'light' | 'dark';
export type PlayerSize = 'standard' | 'compact';
