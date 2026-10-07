/**
 * The embed player's OWN host constants.
 *
 * The player is deliberately self-contained: it imports only `./` and svelte,
 * because it ships as a standalone bundle. The show.fm app keeps its own copy
 * of these hosts and asserts the two never drift, so a host change edits both
 * places together.
 */

/** Default API origin when the embedding page sets no `api` attribute. */
export const PLAYER_DEFAULT_API_URL = 'https://api.show.fm';

/** The "Powered by" link target in the player footer. */
export const MARKETING_APEX_URL = 'https://show.fm';
