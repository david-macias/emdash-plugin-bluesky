/**
 * Feed refresh + cache engine.
 *
 * Data flow (deliberately boring and failure-proof):
 * - A background cron (and the public feed route, stale-while-revalidate)
 *   calls `refreshFeed`, which pulls the author's feed from the Bluesky
 *   public API, normalizes it, and writes it to KV under `cache:feed`.
 * - Rendering NEVER calls Bluesky directly: components read the cache
 *   through the public `feed` route, so a Bluesky outage or a slow API
 *   can never break a page — the worst case is a stale feed.
 * - The DID is cached per handle (handles change; DIDs don't). A 400 from
 *   getAuthorFeed triggers one DID re-resolve, in case the handle moved.
 * - Reposts are stored in the cache and filtered at READ time, so toggling
 *   "include reposts" in settings takes effect without a re-fetch.
 */
import type { HttpAccess, KVAccess, LogAccess, PluginContext, SettingsAccess } from "emdash";
import { type BlueskySettings } from "./settings.js";
import type { CachedFeed, FeedResponse, SinglePostResponse } from "./types.js";
/** The slice of PluginContext the refresh engine needs (easy to mock). */
export interface RefreshContext {
    settings: SettingsAccess;
    kv: KVAccess;
    /**
     * Present only when the plugin declares the network:request capability
     * (this plugin does). Typed optional because PluginContext marks it so.
     */
    http?: HttpAccess;
    log: LogAccess;
    cron?: PluginContext["cron"];
}
export interface RefreshResult {
    ok: boolean;
    /** Number of posts stored, when ok. */
    count?: number;
    fetchedAt?: string;
    did?: string;
    /** Short machine-readable reason when not ok. */
    reason?: string;
    /** Human-readable error detail when not ok. */
    error?: string;
}
/**
 * Read all settings keys (missing keys fall back to defaults).
 * The reads run concurrently (Promise.all) instead of one at a time, and
 * the result is memoized per request context, so the route handler,
 * getFeed, and refreshFeed share a single read. Settings are per-request
 * state, so a memo keyed by ctx can never serve a stale admin change;
 * the entry is dropped with the ctx.
 */
export declare function loadSettings(ctx: RefreshContext): Promise<BlueskySettings>;
export declare function readCachedFeed(ctx: RefreshContext): Promise<CachedFeed | null>;
/** True when the cache cannot be served as-is for the current settings. */
export declare function isCacheStale(cached: CachedFeed | null, settings: BlueskySettings, now?: Date): boolean;
/**
 * Fetch the author's feed from Bluesky and write the normalized result to
 * KV. Never throws: every failure is logged and returned as
 * `{ ok: false }`, leaving any existing cache untouched.
 */
export declare function refreshFeed(ctx: RefreshContext, preloaded?: BlueskySettings): Promise<RefreshResult>;
/**
 * Read path for the public `feed` route: serve the cache, refreshing inline
 * (stale-while-revalidate) when it is missing or older than the configured
 * interval. On any failure, serve the stale cache; with no cache at all,
 * return an empty feed — never an error.
 */
export declare function getFeed(ctx: RefreshContext, limit: number, preloaded?: BlueskySettings): Promise<FeedResponse>;
/**
 * Read path for the public `post` route: resolve a bsky.app post URL to a
 * single normalized post, KV-cached like the feed. Returns `post: null`
 * when the URL is not a Bluesky post URL or the post cannot be fetched.
 */
export declare function getSinglePost(ctx: RefreshContext, url: string): Promise<SinglePostResponse>;
/**
 * (Re)schedule the background refresh. Called on plugin:activate and after
 * every cron run, so a settings change to `refreshMinutes` takes effect
 * without a reinstall. Safe to call when cron is unavailable (no-op).
 */
export declare function scheduleRefresh(ctx: RefreshContext): Promise<void>;
//# sourceMappingURL=refresh.d.ts.map