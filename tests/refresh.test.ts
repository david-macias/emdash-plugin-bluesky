/**
 * Refresh engine tests with a mocked fetch and in-memory KV/settings.
 * Covers: happy-path refresh + cache write, DID caching, the 400
 * re-resolve retry, failure leaving the stale cache alone, SWR in getFeed,
 * repost filtering, limit slicing, and the single-post path.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getFeed, getSinglePost, refreshFeed } from "../src/refresh.js";
import { jsonResponse, makeCtx } from "./helpers.js";
import type { FetchImpl } from "../src/bluesky.js";

const DID = "did:plc:g3qjiemolflzumnrnb6alnhq";
const HANDLE = "dmacias.bsky.social";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/dmacias-bsky.json", import.meta.url), "utf-8")) as {
  feed: unknown[];
};

function blueskyFetch(overrides: { feedStatus?: number; feedBody?: unknown } = {}): FetchImpl {
  return async (url: string) => {
    if (url.includes("resolveHandle")) {
      return jsonResponse({ did: DID });
    }
    if (url.includes("getAuthorFeed")) {
      return jsonResponse(overrides.feedBody ?? fixture, overrides.feedStatus ?? 200);
    }
    if (url.includes("getPosts")) {
      const post = (fixture.feed[0] as Record<string, any>).post;
      return jsonResponse({ posts: [post] });
    }
    return jsonResponse({}, 404);
  };
}

const settings = { handle: HANDLE };

describe("refreshFeed", () => {
  it("fetches, normalizes, and caches the feed", async () => {
    const ctx = makeCtx({ settings, fetchImpl: blueskyFetch() });
    const result = await refreshFeed(ctx);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(6);
    expect(result.did).toBe(DID);

    const cached = ctx.kvStore.get("cache:feed") as Record<string, any>;
    expect(cached.handle).toBe(HANDLE);
    expect(cached.did).toBe(DID);
    expect(cached.filter).toBe("posts_no_replies");
    expect(cached.posts).toHaveLength(6);
    expect(cached.posts[0].authorHandle).toBe(HANDLE);

    // DID was cached too.
    expect(ctx.kvStore.get(`cache:did:${HANDLE}`)).toMatchObject({ did: DID });
    // Exactly two Bluesky calls: resolve + feed.
    expect(ctx.fetchCalls).toHaveLength(2);
  });

  it("reuses the cached DID instead of resolving again", async () => {
    const ctx = makeCtx({
      settings,
      kv: { [`cache:did:${HANDLE}`]: { handle: HANDLE, did: DID, resolvedAt: new Date().toISOString() } },
      fetchImpl: blueskyFetch(),
    });
    await refreshFeed(ctx);
    expect(ctx.fetchCalls).toHaveLength(1);
    expect(ctx.fetchCalls[0]).toContain("getAuthorFeed");
  });

  it("re-resolves the DID once after a 400, then retries", async () => {
    let calls = 0;
    const flaky: FetchImpl = async (url: string) => {
      if (url.includes("resolveHandle")) return jsonResponse({ did: DID });
      if (url.includes("getAuthorFeed")) {
        calls += 1;
        if (calls === 1) return jsonResponse({ error: "InvalidRequest" }, 400);
        return jsonResponse(fixture);
      }
      return jsonResponse({}, 404);
    };
    const ctx = makeCtx({ settings, fetchImpl: flaky });
    const result = await refreshFeed(ctx);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(6);
    expect(calls).toBe(2);
  });

  it("returns ok:false and leaves the old cache alone when Bluesky fails", async () => {
    const oldCache = {
      version: 1,
      handle: HANDLE,
      did: DID,
      filter: "posts_no_replies",
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
      posts: [{ uri: "at://old", text: "old" }],
    };
    const ctx = makeCtx({
      settings,
      kv: { "cache:feed": oldCache },
      fetchImpl: async () => jsonResponse({ error: "boom" }, 500),
    });
    const result = await refreshFeed(ctx);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("fetch-failed");
    expect(ctx.kvStore.get("cache:feed")).toEqual(oldCache);
  });

  it("returns no-handle without fetching when no handle is configured", async () => {
    const ctx = makeCtx({ settings: {}, fetchImpl: blueskyFetch() });
    const result = await refreshFeed(ctx);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-handle");
    expect(ctx.fetchCalls).toHaveLength(0);
  });
});

describe("getFeed (stale-while-revalidate)", () => {
  it("serves the fresh cache without fetching", async () => {
    const cached = {
      version: 1,
      handle: HANDLE,
      did: DID,
      filter: "posts_no_replies",
      fetchedAt: new Date().toISOString(),
      posts: [{ uri: "at://a", text: "a" }],
    };
    const ctx = makeCtx({ settings, kv: { "cache:feed": cached }, fetchImpl: blueskyFetch() });
    const feed = await getFeed(ctx, 5);
    expect(feed.stale).toBe(false);
    expect(feed.posts).toHaveLength(1);
    expect(ctx.fetchCalls).toHaveLength(0);
  });

  it("refreshes inline when the cache is stale, then serves the new data", async () => {
    const stale = {
      version: 1,
      handle: HANDLE,
      did: DID,
      filter: "posts_no_replies",
      fetchedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      posts: [],
    };
    const ctx = makeCtx({ settings, kv: { "cache:feed": stale }, fetchImpl: blueskyFetch() });
    const feed = await getFeed(ctx, 5);
    expect(feed.stale).toBe(false);
    expect(feed.posts).toHaveLength(5);
    expect(ctx.fetchCalls.length).toBeGreaterThan(0);
  });

  it("serves the stale cache when the inline refresh fails", async () => {
    const stale = {
      version: 1,
      handle: HANDLE,
      did: DID,
      filter: "posts_no_replies",
      fetchedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      posts: [{ uri: "at://a", text: "a", segments: [{ text: "a" }] }],
    };
    const ctx = makeCtx({
      settings,
      kv: { "cache:feed": stale },
      fetchImpl: async () => jsonResponse({ error: "boom" }, 500),
    });
    const feed = await getFeed(ctx, 5);
    expect(feed.stale).toBe(true);
    expect(feed.posts).toHaveLength(1);
  });

  it("returns an empty feed (not an error) when there is no cache and the fetch fails", async () => {
    const ctx = makeCtx({ settings, fetchImpl: async () => jsonResponse({}, 500) });
    const feed = await getFeed(ctx, 5);
    expect(feed.posts).toEqual([]);
    expect(feed.fetchedAt).toBeNull();
    expect(feed.stale).toBe(true);
  });

  it("filters reposts out by default and slices to the limit", async () => {
    const now = new Date().toISOString();
    const posts = [
      { uri: "at://1", text: "one", segments: [{ text: "one" }], createdAt: now },
      { uri: "at://2", text: "two", segments: [{ text: "two" }], createdAt: now, repostedByHandle: HANDLE },
      { uri: "at://3", text: "three", segments: [{ text: "three" }], createdAt: now },
    ];
    const ctx = makeCtx({
      settings,
      kv: { "cache:feed": { version: 1, handle: HANDLE, did: DID, filter: "posts_no_replies", fetchedAt: now, posts } },
      fetchImpl: blueskyFetch(),
    });
    const feed = await getFeed(ctx, 2);
    expect(feed.posts.map((p) => p.text)).toEqual(["one", "three"]);

    const ctxWithReposts = makeCtx({
      settings: { ...settings, includeReposts: true },
      kv: { "cache:feed": { version: 1, handle: HANDLE, did: DID, filter: "posts_no_replies", fetchedAt: now, posts } },
      fetchImpl: blueskyFetch(),
    });
    const withReposts = await getFeed(ctxWithReposts, 2);
    expect(withReposts.posts.map((p) => p.text)).toEqual(["one", "two"]);
  });

  it("treats a filter change as stale so the next read re-fetches", async () => {
    const now = new Date().toISOString();
    const ctx = makeCtx({
      settings: { ...settings, filter: "posts_with_media" },
      kv: {
        "cache:feed": {
          version: 1,
          handle: HANDLE,
          did: DID,
          filter: "posts_no_replies",
          fetchedAt: now,
          posts: [],
        },
      },
      fetchImpl: blueskyFetch(),
    });
    const feed = await getFeed(ctx, 5);
    expect(ctx.fetchCalls.some((u) => u.includes("getAuthorFeed"))).toBe(true);
    expect(feed.posts).toHaveLength(5);
  });
});

describe("getSinglePost", () => {
  const url = "https://bsky.app/profile/dmacias.bsky.social/post/3n2jf3l55g22s";

  it("fetches and caches a single post by URL", async () => {
    const ctx = makeCtx({ settings, fetchImpl: blueskyFetch() });
    const first = await getSinglePost(ctx, url);
    expect(first.post?.authorHandle).toBe(HANDLE);
    expect(first.fetchedAt).toBeTruthy();

    const callsAfterFirst = ctx.fetchCalls.length;
    const second = await getSinglePost(ctx, url);
    expect(second.post?.uri).toBe(first.post?.uri);
    expect(ctx.fetchCalls.length).toBe(callsAfterFirst); // served from KV
  });

  it("returns null for non-Bluesky URLs", async () => {
    const ctx = makeCtx({ settings, fetchImpl: blueskyFetch() });
    expect((await getSinglePost(ctx, "https://example.com/x")).post).toBeNull();
    expect((await getSinglePost(ctx, "not a url")).post).toBeNull();
    expect(ctx.fetchCalls).toHaveLength(0);
  });
});
