/**
 * French strings for the player, the episode list, the play button, the
 * mini-player and the transcript (design page 8 where it gives them).
 * Bundled into the npm entries; the CDN script loads it on demand as
 * dist/cdn/locales/fr.js (see lazy.ts).
 */
import { ELEMENT_FR } from '../element-strings.js';
import type { ListFacadeStrings, ListStrings } from '../list-strings.js';
import type { PlayBuilderStrings, PlayStrings } from '../play-strings.js';
import type { Strings } from '../strings.js';
import type { TranscriptFacadeStrings, TranscriptStrings } from '../transcript-strings.js';

const FR: Strings &
	ListStrings &
	ListFacadeStrings &
	PlayStrings &
	PlayBuilderStrings &
	TranscriptStrings &
	TranscriptFacadeStrings = {
	// The play button's labels (element-strings.ts); `minutes` and
	// `actionName` are the list's too.
	...ELEMENT_FR,
	error: 'Lecture impossible pour le moment.',
	blocked: 'Votre navigateur a bloqué la lecture.',
	suspended: 'Émission indisponible pour le moment.',
	retry: 'Réessayer',
	listenOnShowfm: 'Écouter sur show.fm',
	loading: 'Chargement du lecteur audio',
	playerLabel: 'Lecteur audio\u202f: {title}',
	play: 'Lire',
	pause: 'Pause',
	back15: 'Reculer de 15 secondes',
	forward30: 'Avancer de 30 secondes',
	seek: 'Position',
	seekValue: '{current} sur {total}',
	speed: 'Vitesse de lecture, actuellement {rate}×',
	speedChanged: 'Vitesse de lecture {rate}×',
	mute: 'Couper le son',
	unmute: 'Rétablir le son',
	muted: 'Son coupé',
	unmuted: 'Son rétabli',
	playing: 'Lecture en cours',
	paused: 'En pause',
	finished: 'Terminé',
	download: 'Télécharger l’épisode',
	share: 'Partager l’épisode',
	shared: 'Partagé',
	linkCopied: 'Lien copié',
	shareFailed: 'Partage impossible',
	transcript: 'Transcription',
	poweredBy: 'Propulsé par',
	facadeTitle: 'Lire l’épisode du podcast',
	facadeMeta: 'Chargé depuis show.fm à la lecture',
	// The episode list (list-strings.ts).
	loadingEpisodes: 'Chargement des épisodes',
	loadingMore: 'Chargement des épisodes…',
	loadMore: 'Charger plus d’épisodes',
	episodesLoaded: 'Épisodes chargés',
	endOfList: 'Voici tous les épisodes de {show}.',
	noEpisodes: 'Aucun épisode pour l’instant',
	noEpisodesNote: 'Les nouveaux épisodes de {show} apparaîtront ici dès leur publication.',
	listError: 'Chargement des épisodes impossible.',
	facadeListTitle: 'Charger les épisodes',
	facadeListMeta: 'Les épisodes se chargent depuis show.fm au clic.',
	trailer: 'Bande-annonce',
	bonus: 'Bonus',
	explicit: 'Explicite',
	more: 'Plus',
	less: 'Moins',
	seasonEpisode: 'S{season} · Ép. {episode}',
	seasonEpisodeSpoken: 'Saison {season}, épisode {episode}',
	seasonOnly: 'S{season}',
	seasonOnlySpoken: 'Saison {season}',
	episodeOnly: 'Ép. {episode}',
	episodeOnlySpoken: 'Épisode {episode}',
	nowPlaying: 'En cours de lecture',
	statusLine: '{status} · {remaining}',
	remaining: '{time} restantes',
	minutes: '{n} min',
	hoursMinutes: '{h} h {m} min',
	pillPlay: 'Lire · {duration}',
	pillPause: 'Pause · {remaining}',
	pillResume: 'Reprendre · {remaining}',
	loadingAudio: 'Chargement…',
	// A narrow no-break space before the colon, as French typography wants.
	actionName: '{verb}\u202f: {title}',
	// The play button and the mini-player (play-strings.ts).
	playEpisodePlain: 'Lire l’épisode',
	listenPlain: 'Écouter',
	collapsePlayer: 'Réduire le lecteur',
	expandPlayer: 'Agrandir le lecteur',
	closePlayer: 'Fermer le lecteur et arrêter la lecture',
	miniPlayerOff: 'Les visiteurs peuvent seulement lire et mettre en pause.',
	// The transcript (transcript-strings.ts); its facade is the click loader's.
	facadeTranscriptTitle: 'Charger la transcription',
	transcriptText: 'Texte de la transcription',
	searchTranscript: 'Rechercher dans la transcription',
	matchCount: '{n} sur {total}',
	noMatches: 'Aucun résultat',
	previousMatch: 'Résultat précédent',
	nextMatch: 'Résultat suivant',
	clearSearch: 'Effacer la recherche',
	loadingTranscript: 'Chargement de la transcription',
	transcriptError: 'Chargement de la transcription impossible. L’épisode continue.',
	transcriptIdle: 'Lancez un épisode pour suivre sa transcription ici.',
	transcriptNone: 'Cet épisode n’a pas de transcription.',
	jumpTo: 'Aller à {time}, {speaker}',
	jumpToTime: 'Aller à {time}',
	backToNow: 'Revenir à la lecture · {time}',
	closeTranscript: 'Fermer la transcription'
};

export default FR;
