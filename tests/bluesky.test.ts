/**
 * Normalizer tests: facet linkification (including multi-byte text),
 * reposts, embeds, quotes, and the empty-feed / malformed-input cases.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  linkifyText,
  normalizeFeedItem,
  normalizeHandle,
  normalizePostView,
  parsePostUrl,
  postUrl,
  resolveHandle,
  rkeyFromUri,
} from "../src/bluesky.js";
import { jsonResponse } from "./helpers.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/dmacias-bsky.json", import.meta.url), "utf-8")) as {
  feed: unknown[];
};

describe("linkifyText", () => {
  it("returns plain text as a single segment when there are no facets", () => {
    expect(linkifyText("Hello world", undefined)).toEqual([{ text: "Hello world" }]);
    expect(linkifyText("", [])).toEqual([]);
  });

  it("linkifies a mention facet using byte offsets", () => {
    const item = fixture.feed[5] as Record<string, any>;
    const text = item.post.record.text as string;
    const segments = linkifyText(text, item.post.record.facets);
    const mention = segments.find((s) => s.href);
    expect(mention?.text).toBe("@ericmigi.com");
    expect(mention?.href).toMatch(/^https:\/\/bsky\.app\/profile\/did:/);
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });

  it("handles multi-byte characters: byte offsets are not string indexes", () => {
    // "café ☕ @bob" — é is 2 bytes, ☕ is 3 bytes in UTF-8.
    const text = "café ☕ @bob done";
    const atIndex = text.indexOf("@bob");
    const encoder = new TextEncoder();
    const byteStart = encoder.encode(text.slice(0, atIndex)).length;
    const byteEnd = byteStart + encoder.encode("@bob").length;
    const facets = [
      {
        index: { byteStart, byteEnd },
        features: [{ $type: "app.bsky.richtext.facet#mention", did: "did:plc:bob" }],
      },
    ];
    const segments = linkifyText(text, facets);
    expect(segments.find((s) => s.href)).toEqual({
      text: "@bob",
      href: "https://bsky.app/profile/did:plc:bob",
    });
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });

  it("linkifies link and hashtag facets", () => {
    const text = "see https://example.com and #bluesky";
    const encoder = new TextEncoder();
    const linkStart = encoder.encode("see ").length;
    const linkEnd = linkStart + encoder.encode("https://example.com").length;
    const tagStart = encoder.encode("see https://example.com and ").length;
    const tagEnd = tagStart + encoder.encode("#bluesky").length;
    const segments = linkifyText(text, [
      {
        index: { byteStart: linkStart, byteEnd: linkEnd },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://example.com" }],
      },
      {
        index: { byteStart: tagStart, byteEnd: tagEnd },
        features: [{ $type: "app.bsky.richtext.facet#tag", tag: "bluesky" }],
      },
    ]);
    expect(segments).toEqual([
      { text: "see " },
      { text: "https://example.com", href: "https://example.com" },
      { text: " and " },
      { text: "#bluesky", href: "https://bsky.app/hashtag/bluesky" },
    ]);
  });

  it("skips overlapping and out-of-range facets instead of breaking", () => {
    const text = "hello world";
    const segments = linkifyText(text, [
      {
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://a.example" }],
      },
      {
        index: { byteStart: 3, byteEnd: 8 }, // overlaps the first: skipped
        features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://b.example" }],
      },
      {
        index: { byteStart: 6, byteEnd: 99 }, // past the end: skipped
        features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://c.example" }],
      },
    ]);
    expect(segments).toEqual([
      { text: "hello", href: "https://a.example" },
      { text: " world" },
    ]);
  });

  it("drops non-http(s) facet links (e.g. javascript:) to plain text", () => {
    const text = "click javascript:alert(1) here";
    const encoder = new TextEncoder();
    const start = encoder.encode("click ").length;
    const end = start + encoder.encode("javascript:alert(1)").length;
    const segments = linkifyText(text, [
      {
        index: { byteStart: start, byteEnd: end },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: "javascript:alert(1)" }],
      },
    ]);
    expect(segments).toEqual([
      { text: "click " },
      { text: "javascript:alert(1)" },
      { text: " here" },
    ]);
  });
});

describe("normalizeFeedItem", () => {
  it("normalizes all six fixture items", () => {
    const posts = fixture.feed.map((item) => normalizeFeedItem(item));
    expect(posts).toHaveLength(6);
    expect(posts.every(Boolean)).toBe(true);
    for (const post of posts) {
      expect(post!.authorHandle).toBe("dmacias.bsky.social");
      expect(post!.url).toMatch(/^https:\/\/bsky\.app\/profile\/dmacias\.bsky\.social\/post\//);
      expect(post!.segments.map((s) => s.text).join("")).toBe(post!.text);
    }
  });

  it("normalizes the images embed", () => {
    const post = normalizeFeedItem(fixture.feed[3]);
    expect(post!.images).toHaveLength(1);
    expect(post!.images![0].thumb).toMatch(/^https:\/\/cdn\.bsky\.app\//);
    expect(post!.images![0].fullsize).toMatch(/^https:\/\/cdn\.bsky\.app\//);
  });

  it("marks reposts and keeps the original author", () => {
    const item = {
      post: {
        uri: "at://did:plc:orig/app.bsky.feed.post/abc",
        cid: "bafy1",
        author: { did: "did:plc:orig", handle: "orig.bsky.social", displayName: "Orig" },
        record: { text: "original post", createdAt: "2026-11-19T10:00:00.000Z" },
        likeCount: 3,
        repostCount: 1,
        replyCount: 0,
      },
      reason: {
        $type: "app.bsky.feed.defs#reasonRepost",
        by: { did: "did:plc:me", handle: "dmacias.bsky.social", displayName: "David Macias" },
        indexedAt: "2026-11-19T11:00:00.000Z",
      },
    };
    const post = normalizeFeedItem(item);
    expect(post!.authorHandle).toBe("orig.bsky.social");
    expect(post!.repostedByHandle).toBe("dmacias.bsky.social");
    expect(post!.repostedByDisplayName).toBe("David Macias");
  });

  it("normalizes external link cards and nested quotes", () => {
    const item = {
      post: {
        uri: "at://did:plc:me/app.bsky.feed.post/xyz",
        cid: "bafy2",
        author: { did: "did:plc:me", handle: "dmacias.bsky.social", displayName: "David Macias" },
        record: { text: "read this", createdAt: "2026-11-19T10:00:00.000Z" },
        embed: {
          $type: "app.bsky.embed.recordWithMedia#view",
          record: {
            $type: "app.bsky.embed.record#view",
            record: {
              uri: "at://did:plc:q/app.bsky.feed.post/q1",
              cid: "bafy3",
              author: { did: "did:plc:q", handle: "quoted.bsky.social", displayName: "Quoted" },
              value: { text: "the quoted post", createdAt: "2026-11-18T10:00:00.000Z" },
            },
          },
          media: {
            $type: "app.bsky.embed.external#view",
            external: {
              uri: "https://example.com/article",
              title: "An article",
              description: "Description here",
            },
          },
        },
      },
    };
    const post = normalizeFeedItem(item);
    expect(post!.external?.uri).toBe("https://example.com/article");
    expect(post!.external?.title).toBe("An article");
    expect(post!.quote?.authorHandle).toBe("quoted.bsky.social");
    expect(post!.quote?.text).toBe("the quoted post");
  });

  it("drops non-http(s) URLs from link cards and avatars", () => {
    const item = {
      post: {
        uri: "at://did:plc:me/app.bsky.feed.post/xyz",
        cid: "bafy2",
        author: {
          did: "did:plc:me",
          handle: "dmacias.bsky.social",
          displayName: "David Macias",
          avatar: "javascript:alert(1)",
        },
        record: { text: "read this", createdAt: "2026-11-19T10:00:00.000Z" },
        embed: {
          $type: "app.bsky.embed.external#view",
          external: {
            uri: "javascript:alert(1)",
            title: "Evil",
            description: "x",
          },
        },
      },
    };
    const post = normalizeFeedItem(item);
    expect(post!.external).toBeUndefined();
    expect(post!.authorAvatar).toBeUndefined();
  });

  it("drops images whose thumb or fullsize is not http(s)", () => {
    const item = {
      post: {
        uri: "at://did:plc:me/app.bsky.feed.post/img",
        cid: "bafy5",
        author: { did: "did:plc:me", handle: "dmacias.bsky.social" },
        record: { text: "pic", createdAt: "2026-11-19T10:00:00.000Z" },
        embed: {
          $type: "app.bsky.embed.images#view",
          images: [
            { thumb: "javascript:alert(1)", fullsize: "https://cdn.bsky.app/img1", alt: "bad" },
            { thumb: "https://cdn.bsky.app/thumb2", fullsize: "https://cdn.bsky.app/img2", alt: "good" },
          ],
        },
      },
    };
    const post = normalizeFeedItem(item);
    expect(post!.images).toHaveLength(1);
    expect(post!.images![0].alt).toBe("good");
  });

  it("ignores video embeds in v1 but keeps the text", () => {
    const item = {
      post: {
        uri: "at://did:plc:me/app.bsky.feed.post/vid",
        cid: "bafy4",
        author: { did: "did:plc:me", handle: "dmacias.bsky.social" },
        record: { text: "watch this", createdAt: "2026-11-19T10:00:00.000Z" },
        embed: { $type: "app.bsky.embed.video#view", playlist: "https://example.com/hls.m3u8" },
      },
    };
    const post = normalizeFeedItem(item);
    expect(post!.text).toBe("watch this");
    expect(post!.images).toBeUndefined();
    expect(post!.external).toBeUndefined();
  });

  it("returns null for blocked quotes and malformed posts", () => {
    expect(normalizeFeedItem(null)).toBeNull();
    expect(normalizeFeedItem({})).toBeNull();
    expect(normalizeFeedItem({ post: { uri: "at://x", author: {}, record: {} } })).toBeNull();
    const blocked = normalizePostView({
      uri: "at://did:plc:me/app.bsky.feed.post/b1",
      author: { handle: "dmacias.bsky.social" },
      record: { text: "hi", createdAt: "2026-11-19T10:00:00.000Z" },
      embed: {
        $type: "app.bsky.embed.record#view",
        record: { $type: "app.bsky.embed.record#viewBlocked", uri: "at://did:plc:x/app.bsky.feed.post/b2" },
      },
    });
    expect(blocked?.quote).toBeUndefined();
  });
});

describe("post URLs", () => {
  it("builds bsky.app URLs from AT URIs", () => {
    expect(postUrl("dmacias.bsky.social", "at://did:plc:abc/app.bsky.feed.post/3n2jf3l55g22s")).toBe(
      "https://bsky.app/profile/dmacias.bsky.social/post/3n2jf3l55g22s",
    );
    expect(rkeyFromUri("at://did:plc:abc/app.bsky.feed.post/3n2jf3l55g22s")).toBe("3n2jf3l55g22s");
    expect(rkeyFromUri("not-an-at-uri")).toBeNull();
  });

  it("parses bsky.app post URLs (handle or DID, trailing slash tolerated)", () => {
    expect(parsePostUrl("https://bsky.app/profile/dmacias.bsky.social/post/3n2jf3l55g22s")).toEqual({
      handleOrDid: "dmacias.bsky.social",
      rkey: "3n2jf3l55g22s",
    });
    expect(parsePostUrl("https://bsky.app/profile/did:plc:g3qjiemolflzumnrnb6alnhq/post/3n2jf3l55g22s/")).toEqual({
      handleOrDid: "did:plc:g3qjiemolflzumnrnb6alnhq",
      rkey: "3n2jf3l55g22s",
    });
    expect(parsePostUrl("https://example.com/profile/x/post/y")).toBeNull();
    expect(parsePostUrl("https://bsky.app/profile/x")).toBeNull();
    expect(parsePostUrl("not a url")).toBeNull();
  });

  it("rejects malformed post URLs before any network call", () => {
    // rkey must be a 13-char TID (base32-sortable alphabet)
    expect(parsePostUrl("https://bsky.app/profile/dmacias.bsky.social/post/abc")).toBeNull();
    expect(parsePostUrl("https://bsky.app/profile/dmacias.bsky.social/post/3n2jf3l55g22")).toBeNull();
    expect(parsePostUrl("https://bsky.app/profile/dmacias.bsky.social/post/3n2jf3l55g22sx")).toBeNull();
    expect(parsePostUrl("https://bsky.app/profile/dmacias.bsky.social/post/3N2JF3L55G22S")).toBeNull();
    // handle must be a valid domain name or DID
    expect(parsePostUrl("https://bsky.app/profile/not a handle/post/3n2jf3l55g22s")).toBeNull();
    expect(parsePostUrl("https://bsky.app/profile/bad_handle!/post/3n2jf3l55g22s")).toBeNull();
    expect(parsePostUrl("https://bsky.app/profile/did:not-a-did/post/3n2jf3l55g22s")).toBeNull();
    // valid handle and DID still parse
    expect(parsePostUrl("https://bsky.app/profile/dmacias.bsky.social/post/3n2jf3l55g22s")).toEqual({
      handleOrDid: "dmacias.bsky.social",
      rkey: "3n2jf3l55g22s",
    });
  });
});

describe("normalizeHandle", () => {
  it("strips leading @s and trims whitespace", () => {
    expect(normalizeHandle("@dmacias.bsky.social")).toBe("dmacias.bsky.social");
    expect(normalizeHandle("@@dmacias.bsky.social")).toBe("dmacias.bsky.social");
    expect(normalizeHandle("  @dmacias.bsky.social ")).toBe("dmacias.bsky.social");
    expect(normalizeHandle("dmacias.bsky.social")).toBe("dmacias.bsky.social");
    expect(normalizeHandle("@")).toBe("");
  });
});

describe("resolveHandle", () => {
  it("calls the API with the bare handle even when given a leading @", async () => {
    const seen: string[] = [];
    const fetchImpl = async (url: string) => {
      seen.push(url);
      return jsonResponse({ did: "did:plc:test" });
    };
    const did = await resolveHandle(fetchImpl, "@dmacias.bsky.social");
    expect(did).toBe("did:plc:test");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("handle=dmacias.bsky.social");
    expect(seen[0]).not.toContain("%40");
  });

  it("passes an abort signal (timeout) to the fetch", async () => {
    let seenInit: RequestInit | undefined;
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      seenInit = init;
      return jsonResponse({ did: "did:plc:test" });
    };
    await resolveHandle(fetchImpl, "dmacias.bsky.social");
    expect(seenInit?.signal).toBeInstanceOf(AbortSignal);
  });
});
