/**
 * Plugin wiring tests: the definition createPlugin() returns (id, version,
 * capabilities, allowed hosts, routes, admin schema, blocks) and the
 * behavior of its hooks and route handlers against a mocked context.
 *
 * These run against the tests/stubs/emdash.ts stand-in for definePlugin
 * (see vitest.config.ts). The REAL definePlugin validation is covered by
 * scripts/smoke.mjs against the installed emdash 1.5.0 package.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blueskyPlugin, createPlugin } from "../src/index.js";
import { buildPluginDefinition } from "../src/plugin.js";
import { jsonResponse, makeCtx } from "./helpers.js";
import type { FetchImpl } from "../src/bluesky.js";

const DID = "did:plc:g3qjiemolflzumnrnb6alnhq";
const HANDLE = "dmacias.bsky.social";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/dmacias-bsky.json", import.meta.url), "utf-8"));

const blueskyFetch: FetchImpl = async (url: string) => {
  if (url.includes("resolveHandle")) return jsonResponse({ did: DID });
  if (url.includes("getAuthorFeed")) return jsonResponse(fixture);
  return jsonResponse({}, 404);
};

function def() {
  return buildPluginDefinition() as Record<string, any>;
}

describe("createPlugin / descriptor", () => {
  it("returns a definition with the right id, version, capabilities, and hosts", () => {
    const d = def();
    expect(d.id).toBe("emdash-plugin-bluesky");
    expect(d.version).toBe("1.0.5");
    expect(d.capabilities).toEqual(["network:request"]);
    expect(d.allowedHosts).toEqual(["public.api.bsky.app"]);
  });

  it("declares the feed, post, and refresh routes with the right access", () => {
    const d = def();
    expect(d.routes.feed.public).toBe(true);
    expect(d.routes.feed.methods).toEqual(["GET"]);
    expect(d.routes.post.public).toBe(true);
    expect(d.routes.post.methods).toEqual(["GET"]);
    expect(d.routes.refresh.public).toBeUndefined();
    expect(d.routes.refresh.methods).toEqual(["POST"]);
    expect(d.routes.refresh.permission).toBe("plugins:manage");
  });

  it("declares settings for every documented key and both blocks", () => {
    const d = def();
    const keys = Object.keys(d.admin.settingsSchema);
    expect(keys.sort()).toEqual(
      ["filter", "handle", "includeReposts", "position", "postCount", "postPosition", "postsPosition", "refreshMinutes", "showCounts", "showImages"].sort(),
    );
    const types = d.admin.portableTextBlocks.map((b: any) => b.type);
    expect(types).toEqual(["bluesky-feed", "bluesky-post"]);
    const postBlock = d.admin.portableTextBlocks.find((b: any) => b.type === "bluesky-post");
    expect(postBlock.fields[0].action_id).toBe("id");
  });

  it("blueskyPlugin() returns a native descriptor pointing at this package", () => {
    const descriptor = blueskyPlugin();
    expect(descriptor.id).toBe("emdash-plugin-bluesky");
    expect(descriptor.version).toBe("1.0.5");
    expect(descriptor.format).toBe("native");
    expect(descriptor.entrypoint).toBe("emdash-plugin-bluesky");
    expect(descriptor.componentsEntry).toBe("emdash-plugin-bluesky/astro");
  });

  it("createPlugin() and the default export build the same definition", () => {
    expect(JSON.stringify(createPlugin())).toBe(JSON.stringify(def()));
  });
});

describe("hooks", () => {
  it("plugin:install seeds the schema defaults without clobbering stored values", async () => {
    const d = def();
    const ctx = makeCtx({ settings: { handle: "someone.bsky.social" }, fetchImpl: blueskyFetch });
    await d.hooks["plugin:install"]({}, ctx);
    expect(ctx.settingsStore.get("handle")).toBe("someone.bsky.social");
    expect(ctx.settingsStore.get("postCount")).toBe(5);
    expect(ctx.settingsStore.get("refreshMinutes")).toBe(15);
    expect(ctx.settingsStore.get("showCounts")).toBe(true);
  });

  it("plugin:activate schedules the refresh; plugin:deactivate cancels it", async () => {
    const d = def();
    const ctx = makeCtx({ settings: { handle: HANDLE }, fetchImpl: blueskyFetch, withCron: true });
    await d.hooks["plugin:activate"]({}, ctx);
    expect(ctx.cronCalls).toEqual([{ name: "bluesky-refresh", schedule: "*/15 * * * *" }]);
    await d.hooks["plugin:deactivate"]({}, ctx);
    expect(ctx.cancelled).toEqual(["bluesky-refresh"]);
  });

  it("cron handler refreshes the feed and ignores other task names", async () => {
    const d = def();
    const ctx = makeCtx({ settings: { handle: HANDLE }, fetchImpl: blueskyFetch, withCron: true });
    await d.hooks.cron({ name: "something-else", scheduledAt: new Date().toISOString() }, ctx);
    expect(ctx.fetchCalls).toHaveLength(0);
    await d.hooks.cron({ name: "bluesky-refresh", scheduledAt: new Date().toISOString() }, ctx);
    expect(ctx.fetchCalls.length).toBeGreaterThan(0);
    expect((ctx.kvStore.get("cache:feed") as any).posts).toHaveLength(6);
  });
});

describe("routes", () => {
  it("feed route serves cached posts and honors the limit query param", async () => {
    const d = def();
    const ctx = makeCtx({ settings: { handle: HANDLE }, fetchImpl: blueskyFetch });
    const data = (await d.routes.feed.handler({ ...ctx, input: { limit: "2" } })) as any;
    expect(data.posts).toHaveLength(2);
    expect(data.handle).toBe(HANDLE);
    expect(data.stale).toBe(false);
  });

  it("feed route falls back to the postCount setting with no limit param", async () => {
    const d = def();
    const ctx = makeCtx({ settings: { handle: HANDLE, postCount: 3 }, fetchImpl: blueskyFetch });
    const data = (await d.routes.feed.handler({ ...ctx, input: {} })) as any;
    expect(data.posts).toHaveLength(3);
  });

  it("refresh route forces a refresh and returns the result", async () => {
    const d = def();
    const ctx = makeCtx({ settings: { handle: HANDLE }, fetchImpl: blueskyFetch });
    const data = (await d.routes.refresh.handler({ ...ctx, input: undefined })) as any;
    expect(data.ok).toBe(true);
    expect(data.count).toBe(6);
  });
});
