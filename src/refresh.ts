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
import {
  BlueskyError,
  fetchAuthorFeed,
  fetchPostsByUri,
  normalizeFeedItem,
  normalizePostView,
  parsePostUrl,
  resolveHandle,
  type FetchImpl,
} from "./bluesky.js";
import {
  CRON_TASK_NAME,
  FETCH_LIMIT,
  KV_DID_PREFIX,
  KV_FEED_KEY,
  KV_POST_PREFIX,
  PLUGIN_ID,
} from "./constants.js";
import { cronExpressionFor, readSettings, type BlueskySettings } from "./settings.js";
import type { CachedDid, CachedFeed, CachedPost, FeedResponse, SinglePostResponse } from "./types.js";

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

/** Read all settings keys (missing keys fall back to defaults). */
export async function loadSettings(ctx: RefreshContext): Promise<BlueskySettings> {
  const raw: Record<string, unknown> = {};
  for (const key of ["handle", "postCount", "includeReposts", "filter", "refreshMinutes", "showCounts", "showImages", "position"]) {
    try {
      raw[key] = await ctx.settings.get(key);
    } catch {
      raw[key] = null;
    }
  }
  return readSettings(raw);
}

export async function readCachedFeed(ctx: RefreshContext): Promise<CachedFeed | null> {
  try {
    const cached = await ctx.kv.get<CachedFeed>(KV_FEED_KEY);
    if (!cached || cached.version !== 1 || !Array.isArray(cached.posts)) return null;
    return cached;
  } catch (cause) {
    ctx.log.warn(`[${PLUGIN_ID}] failed to read cached feed`, cause);
    return null;
  }
}

function ageMs(fetchedAt: string, now: Date): number {
  const fetched = Date.parse(fetchedAt);
  if (Number.isNaN(fetched)) return Number.POSITIVE_INFINITY;
  return now.getTime() - fetched;
}

/** True when the cache cannot be served as-is for the current settings. */
export function isCacheStale(cached: CachedFeed | null, settings: BlueskySettings, now = new Date()): boolean {
  if (!cached) return true;
  if (cached.handle !== settings.handle) return true;
  if (cached.filter !== settings.filter) return true;
  return ageMs(cached.fetchedAt, now) > settings.refreshMinutes * 60_000;
}

async function resolveDid(ctx: RefreshContext, fetchImpl: FetchImpl, handle: string): Promise<string> {
  const cacheKey = `${KV_DID_PREFIX}${handle.toLowerCase()}`;
  try {
    const cached = await ctx.kv.get<CachedDid>(cacheKey);
    if (cached && typeof cached.did === "string" && cached.did.startsWith("did:")) {
      return cached.did;
    }
  } catch {
    // Fall through to a live resolve.
  }
  const did = await resolveHandle(fetchImpl, handle);
  try {
    await ctx.kv.set(cacheKey, {
      handle,
      did,
      resolvedAt: new Date().toISOString(),
    } satisfies CachedDid);
  } catch (cause) {
    ctx.log.warn(`[${PLUGIN_ID}] failed to cache DID for ${handle}`, cause);
  }
  return did;
}

/**
 * Fetch the author's feed from Bluesky and write the normalized result to
 * KV. Never throws: every failure is logged and returned as
 * `{ ok: false }`, leaving any existing cache untouched.
 */
export async function refreshFeed(ctx: RefreshContext): Promise<RefreshResult> {
  const settings = await loadSettings(ctx);
  if (!settings.handle) {
    return { ok: false, reason: "no-handle", error: "No Bluesky handle configured." };
  }
  if (!ctx.http) {
    return {
      ok: false,
      reason: "no-http",
      error: "network:request capability is not available.",
    };
  }
  const fetchImpl = ctx.http.fetch.bind(ctx.http);

  const fetchedAt = new Date().toISOString();
  try {
    let did = await resolveDid(ctx, fetchImpl, settings.handle);
    let raw: unknown[];
    try {
      raw = await fetchAuthorFeed(fetchImpl, did, settings.filter, FETCH_LIMIT);
    } catch (cause) {
      // A 400 here usually means the cached DID is stale (handle moved).
      // Re-resolve once and retry before giving up.
      if (cause instanceof BlueskyError && cause.status === 400) {
        ctx.log.info(`[${PLUGIN_ID}] feed fetch 400d for ${settings.handle}; re-resolving DID`);
        await ctx.kv.delete(`${KV_DID_PREFIX}${settings.handle.toLowerCase()}`);
        did = await resolveDid(ctx, fetchImpl, settings.handle);
        raw = await fetchAuthorFeed(fetchImpl, did, settings.filter, FETCH_LIMIT);
      } else {
        throw cause;
      }
    }

    const posts = raw
      .map((item) => normalizeFeedItem(item))
      .filter((post): post is NonNullable<typeof post> => post !== null);

    const cached: CachedFeed = {
      version: 1,
      handle: settings.handle,
      did,
      filter: settings.filter,
      fetchedAt,
      posts,
    };
    await ctx.kv.set(KV_FEED_KEY, cached);
    ctx.log.info(`[${PLUGIN_ID}] refreshed feed for ${settings.handle}: ${posts.length} posts`);
    return { ok: true, count: posts.length, fetchedAt, did };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    ctx.log.error(`[${PLUGIN_ID}] feed refresh failed for ${settings.handle}`, cause);
    return { ok: false, reason: "fetch-failed", error: message };
  }
}

/**
 * Read path for the public `feed` route: serve the cache, refreshing inline
 * (stale-while-revalidate) when it is missing or older than the configured
 * interval. On any failure, serve the stale cache; with no cache at all,
 * return an empty feed — never an error.
 */
export async function getFeed(ctx: RefreshContext, limit: number): Promise<FeedResponse> {
  const settings = await loadSettings(ctx);
  const now = new Date();
  let cached = await readCachedFeed(ctx);

  if (isCacheStale(cached, settings, now)) {
    await refreshFeed(ctx);
    cached = await readCachedFeed(ctx);
  }

  if (!cached) {
    return {
      handle: settings.handle,
      did: "",
      fetchedAt: null,
      stale: true,
      position: settings.position,
      posts: [],
    };
  }

  const stale = isCacheStale(cached, settings, new Date());
  let posts = cached.posts;
  if (!settings.includeReposts) {
    posts = posts.filter((post) => !post.repostedByHandle);
  }
  posts = posts.slice(0, Math.max(1, Math.min(25, Math.floor(limit) || settings.postCount)));

  return {
    handle: cached.handle,
    did: cached.did,
    fetchedAt: cached.fetchedAt,
    stale,
    position: settings.position,
    posts,
  };
}

/**
 * Read path for the public `post` route: resolve a bsky.app post URL to a
 * single normalized post, KV-cached like the feed. Returns `post: null`
 * when the URL is not a Bluesky post URL or the post cannot be fetched.
 */
export async function getSinglePost(ctx: RefreshContext, url: string): Promise<SinglePostResponse> {
  const parsed = parsePostUrl(url);
  if (!parsed) return { post: null, fetchedAt: null };

  const settings = await loadSettings(ctx);
  const maxAgeMs = settings.refreshMinutes * 60_000;
  const now = new Date();

  if (!ctx.http) {
    ctx.log.warn(`[${PLUGIN_ID}] single-post fetch unavailable: no http access`);
    return { post: null, fetchedAt: null };
  }
  const fetchImpl = ctx.http.fetch.bind(ctx.http);

  try {
    const did = parsed.handleOrDid.startsWith("did:")
      ? parsed.handleOrDid
      : await resolveDid(ctx, fetchImpl, parsed.handleOrDid);
    const atUri = `at://${did}/app.bsky.feed.post/${parsed.rkey}`;
    const cacheKey = `${KV_POST_PREFIX}${did}:${parsed.rkey}`;

    try {
      const cached = await ctx.kv.get<CachedPost>(cacheKey);
      if (cached && cached.version === 1 && cached.post && ageMs(cached.fetchedAt, now) <= maxAgeMs) {
        return { post: cached.post, fetchedAt: cached.fetchedAt };
      }
    } catch {
      // Fall through to a live fetch.
    }

    const raw = await fetchPostsByUri(fetchImpl, [atUri]);
    const post = raw.length ? normalizePostView(raw[0]) : null;
    if (!post) return { post: null, fetchedAt: null };

    const fetchedAt = now.toISOString();
    try {
      await ctx.kv.set(cacheKey, { version: 1, fetchedAt, post } satisfies CachedPost);
    } catch (cause) {
      ctx.log.warn(`[${PLUGIN_ID}] failed to cache single post ${atUri}`, cause);
    }
    return { post, fetchedAt };
  } catch (cause) {
    ctx.log.warn(`[${PLUGIN_ID}] single-post fetch failed for ${url}`, cause);
    return { post: null, fetchedAt: null };
  }
}

/**
 * (Re)schedule the background refresh. Called on plugin:activate and after
 * every cron run, so a settings change to `refreshMinutes` takes effect
 * without a reinstall. Safe to call when cron is unavailable (no-op).
 */
export async function scheduleRefresh(ctx: RefreshContext): Promise<void> {
  if (!ctx.cron) {
    ctx.log.debug(`[${PLUGIN_ID}] no cron access; background refresh unavailable`);
    return;
  }
  try {
    const settings = await loadSettings(ctx);
    await ctx.cron.schedule(CRON_TASK_NAME, {
      schedule: cronExpressionFor(settings.refreshMinutes),
    });
    ctx.log.info(
      `[${PLUGIN_ID}] scheduled feed refresh every ${settings.refreshMinutes} min`,
    );
  } catch (cause) {
    ctx.log.warn(`[${PLUGIN_ID}] failed to schedule feed refresh`, cause);
  }
}
