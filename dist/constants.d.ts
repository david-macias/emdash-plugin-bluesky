/**
 * Shared constants for emdash-plugin-bluesky.
 * Kept in one place so the descriptor factory, the plugin definition, and
 * the Astro components all agree on ids, versions, and cache keys.
 */
/** Plugin id. Must match the package name and the definePlugin id. */
export declare const PLUGIN_ID = "emdash-plugin-bluesky";
/** Plugin version (semver). Bumped on every release. */
export declare const PLUGIN_VERSION = "1.0.9";
/** Bluesky public API base (no auth required). */
export declare const BLUESKY_API_BASE = "https://public.api.bsky.app/xrpc";
/** bsky.app base for profile / post links. */
export declare const BSKY_APP_BASE = "https://bsky.app";
/** KV key for the cached DID lookup (per handle). */
export declare const KV_DID_PREFIX = "cache:did:";
/** KV key for the cached normalized feed. */
export declare const KV_FEED_KEY = "cache:feed";
/** KV key prefix for cached single posts (keyed by did + rkey). */
export declare const KV_POST_PREFIX = "cache:post:";
/** KV key recording the last failed feed refresh (ISO timestamp). */
export declare const KV_FEED_FAILURE_KEY = "cache:feed:lastFailure";
/**
 * How long a cached DID lookup is trusted. The KV API has no TTL option,
 * so expiry is enforced on read (entries older than this are re-resolved).
 */
export declare const DID_CACHE_MAX_AGE_MS: number;
/** Abort a Bluesky request that takes longer than this. */
export declare const FETCH_TIMEOUT_MS = 3000;
/**
 * After a failed feed refresh, skip the inline (foreground) refresh for
 * this long, serving the stale cache instead. Prevents a Bluesky outage
 * from triggering a retry on every page render.
 */
export declare const REFRESH_FAILURE_BACKOFF_MS = 60000;
/** Name of the cron task that refreshes the feed. */
export declare const CRON_TASK_NAME = "bluesky-refresh";
/**
 * How many posts the refresh fetch asks Bluesky for. Deliberately larger
 * than any single block's count: the cache holds a pool, and the route /
 * component slices it down, so repost filtering and per-block count
 * overrides never need a second network call.
 */
export declare const FETCH_LIMIT = 25;
//# sourceMappingURL=constants.d.ts.map