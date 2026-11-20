/**
 * Shared constants for emdash-plugin-bluesky.
 * Kept in one place so the descriptor factory, the plugin definition, and
 * the Astro components all agree on ids, versions, and cache keys.
 */
/** Plugin id. Must match the package name and the definePlugin id. */
export const PLUGIN_ID = "emdash-plugin-bluesky";
/** Plugin version (semver). Bumped on every release. */
export const PLUGIN_VERSION = "1.0.7";
/** Bluesky public API base (no auth required). */
export const BLUESKY_API_BASE = "https://public.api.bsky.app/xrpc";
/** bsky.app base for profile / post links. */
export const BSKY_APP_BASE = "https://bsky.app";
/** KV key for the cached DID lookup (per handle). */
export const KV_DID_PREFIX = "cache:did:";
/** KV key for the cached normalized feed. */
export const KV_FEED_KEY = "cache:feed";
/** KV key prefix for cached single posts (keyed by did + rkey). */
export const KV_POST_PREFIX = "cache:post:";
/** KV key recording the last failed feed refresh (ISO timestamp). */
export const KV_FEED_FAILURE_KEY = "cache:feed:lastFailure";
/**
 * How long a cached DID lookup is trusted. The KV API has no TTL option,
 * so expiry is enforced on read (entries older than this are re-resolved).
 */
export const DID_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Abort a Bluesky request that takes longer than this. */
export const FETCH_TIMEOUT_MS = 3000;
/**
 * After a failed feed refresh, skip the inline (foreground) refresh for
 * this long, serving the stale cache instead. Prevents a Bluesky outage
 * from triggering a retry on every page render.
 */
export const REFRESH_FAILURE_BACKOFF_MS = 60_000;
/** Name of the cron task that refreshes the feed. */
export const CRON_TASK_NAME = "bluesky-refresh";
/**
 * How many posts the refresh fetch asks Bluesky for. Deliberately larger
 * than any single block's count: the cache holds a pool, and the route /
 * component slices it down, so repost filtering and per-block count
 * overrides never need a second network call.
 */
export const FETCH_LIMIT = 25;
//# sourceMappingURL=constants.js.map