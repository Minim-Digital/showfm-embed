/** A public API episode payload (GET /v1/episodes/{id} → data) for tests. */
export interface FixtureOptions {
	branded?: boolean;
	theme?: string | null;
	wave?: boolean | null;
}

export function episodePayload({ branded = true, theme = null, wave = null }: FixtureOptions = {}) {
	return {
		id: '11111111-2222-4333-8444-555555555555',
		title: 'Episode One',
		published_at: '2026-07-01T10:00:00.000Z',
		audio: {
			url: 'https://media.example.test/audio.mp3',
			content_type: 'audio/mpeg',
			duration_seconds: 1843
		},
		artwork: { url: 'https://media.example.test/cover.png' },
		links: { listen: 'https://show.fm/test-signal/e/episode-one' },
		podcast: {
			title: 'Test Signal',
			brand_color: '#7E22CE',
			player_color: null,
			player_theme: theme,
			player_waveform: wave,
			branding: { show_powered_by: branded }
		}
	};
}
