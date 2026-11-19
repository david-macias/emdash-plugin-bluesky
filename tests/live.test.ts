/**
 * Live Bluesky API verification. Runs ONLY with BLUESKY_LIVE=1:
 *
 *   npm run test:live
 *
 * Hits the real public API (no auth) for dmacias.bsky.social and checks
 * that resolveHandle returns the known DID and that getAuthorFeed returns
 * normalizable posts. This is the one test that touches the network.
 */
import { describe, expect, it } from "vitest";
import { fetchAuthorFeed, normalizeFeedItem, resolveHandle } from "../src/bluesky.js";

const LIVE = process.env.BLUESKY_LIVE === "1";

describe.skipIf(!LIVE)("live Bluesky API", () => {
  it("resolves dmacias.bsky.social to the known DID and fetches a feed", async () => {
    const did = await resolveHandle(globalThis.fetch, "dmacias.bsky.social");
    expect(did).toBe("did:plc:g3qjiemolflzumnrnb6alnhq");

    const raw = await fetchAuthorFeed(globalThis.fetch, did, "posts_no_replies", 5);
    expect(raw.length).toBeGreaterThan(0);
    const posts = raw.map((item) => normalizeFeedItem(item)).filter(Boolean);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]!.authorHandle).toBe("dmacias.bsky.social");
    expect(posts[0]!.url).toMatch(/^https:\/\/bsky\.app\//);
  }, 30_000);
});
