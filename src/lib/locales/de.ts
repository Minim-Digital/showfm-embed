/**
 * German strings for the player, the episode list, the play button and the
 * mini-player (design page 8 where it gives them).
 * Bundled into the npm entries; the CDN script loads it on demand as
 * dist/cdn/locales/de.js (see lazy.ts).
 */
import { ELEMENT_DE } from '../element-strings.js';
import type { ListFacadeStrings, ListStrings } from '../list-strings.js';
import type { PlayBuilderStrings, PlayStrings } from '../play-strings.js';
import type { Strings } from '../strings.js';

const DE: Strings & ListStrings & ListFacadeStrings & PlayStrings & PlayBuilderStrings = {
	// The play button's labels (element-strings.ts); `minutes` and
	// `actionName` are the list's too.
	...ELEMENT_DE,
	error: 'Diese Folge ist gerade nicht abspielbar.',
	blocked: 'Ihr Browser blockiert die Wiedergabe.',
	suspended: 'Diese Show ist gerade nicht verfügbar.',
	retry: 'Erneut versuchen',
	listenOnShowfm: 'Auf show.fm anhören',
	loading: 'Audioplayer wird geladen',
	playerLabel: 'Audioplayer: {title}',
	play: 'Abspielen',
	pause: 'Pause',
	back15: '15 Sekunden zurück',
	forward30: '30 Sekunden vor',
	seek: 'Position',
	seekValue: '{current} von {total}',
	speed: 'Wiedergabegeschwindigkeit, aktuell {rate}×',
	speedChanged: 'Wiedergabegeschwindigkeit {rate}×',
	mute: 'Stummschalten',
	unmute: 'Ton an',
	muted: 'Stumm',
	unmuted: 'Ton an',
	playing: 'Wiedergabe läuft',
	paused: 'Pausiert',
	finished: 'Beendet',
	download: 'Folge herunterladen',
	share: 'Folge teilen',
	shared: 'Geteilt',
	linkCopied: 'Link kopiert',
	shareFailed: 'Teilen nicht möglich',
	poweredBy: 'Bereitgestellt von',
	facadeTitle: 'Podcastfolge abspielen',
	facadeMeta: 'Wird beim Abspielen von show.fm geladen',
	// The episode list (list-strings.ts).
	loadingEpisodes: 'Folgen werden geladen',
	loadingMore: 'Folgen werden geladen…',
	loadMore: 'Weitere Folgen laden',
	episodesLoaded: 'Folgen geladen',
	endOfList: 'Das sind alle Folgen von {show}.',
	noEpisodes: 'Noch keine Folgen',
	noEpisodesNote: 'Neue Folgen von {show} erscheinen hier, sobald sie veröffentlicht sind.',
	listError: 'Laden der Folgen gerade nicht möglich.',
	facadeListTitle: 'Folgen laden',
	facadeListMeta: 'Die Folgen werden beim Klick von show.fm geladen.',
	trailer: 'Trailer',
	bonus: 'Bonus',
	explicit: 'Explizit',
	more: 'Mehr',
	less: 'Weniger',
	seasonEpisode: 'St. {season} · Folge {episode}',
	seasonEpisodeSpoken: 'Staffel {season}, Folge {episode}',
	seasonOnly: 'St. {season}',
	seasonOnlySpoken: 'Staffel {season}',
	episodeOnly: 'Folge {episode}',
	episodeOnlySpoken: 'Folge {episode}',
	nowPlaying: 'Läuft gerade',
	statusLine: '{status} · {remaining}',
	remaining: 'noch {time}',
	minutes: '{n} Min.',
	hoursMinutes: '{h} Std. {m} Min.',
	pillPlay: 'Abspielen · {duration}',
	pillPause: 'Pause · {remaining}',
	pillResume: 'Fortsetzen · {remaining}',
	loadingAudio: 'Wird geladen…',
	actionName: '{verb}: {title}',
	// The play button and the mini-player (play-strings.ts).
	playEpisodePlain: 'Folge abspielen',
	listenPlain: 'Anhören',
	collapsePlayer: 'Player verkleinern',
	expandPlayer: 'Player vergrößern',
	closePlayer: 'Player schließen und Wiedergabe beenden',
	miniPlayerOff: 'Besucher können nur abspielen und pausieren.'
};

export default DE;
