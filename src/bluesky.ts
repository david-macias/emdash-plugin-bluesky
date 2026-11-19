/**
 * Bluesky public API client + normalizer.
 *
 * Pure module: no EmDash imports, so it is unit-testable in isolation.
 * All network access goes through the injected `fetchImpl` (in production
 * that is `ctx.http.fetch`; in tests it is a mock). The Bluesky public API
 * needs no auth.
 *
 * API surface used:
 * - com.atproto.identity.resolveHandle?handle=  -> { did }
 * - app.bsky.feed.getAuthorFeed?actor=&filter=&limit= -> { feed: [...] }
 * - app.bsky.feed.getPosts?uris[]= -> { posts: [...] }
 */

import { BLUESKY_API_BASE, BSKY_APP_BASE, FETCH_TIMEOUT_MS } from "./constants.js";
import type {
  NormalizedExternal,
  NormalizedImage,
  NormalizedPost,
  TextSegment,
} from "./types.js";

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

/** Feed filters accepted by getAuthorFeed. */
export const FEED_FILTERS = [
  "posts_with_replies",
  "posts_no_replies",
  "posts_with_media",
  "posts_and_author_threads",
  "posts_with_video",
] as const;

export type FeedFilter = (typeof FEED_FILTERS)[number];

export class BlueskyError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "BlueskyError";
    this.status = status;
  }
}

async function fetchJson(fetchImpl: FetchImpl, url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new BlueskyError(
      `Bluesky request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  if (!response.ok) {
    throw new BlueskyError(
      `Bluesky request failed with HTTP ${response.status} for ${new URL(url).pathname}`,
      response.status,
    );
  }
  return (await response.json()) as unknown;
}

/**
 * Normalize a handle as typed by a human: trim whitespace and strip a
 * leading @ (or several). Bluesky's resolveHandle rejects "@handle" with
 * InvalidRequest, so this must happen before any API call.
 */
export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "");
}

/** Resolve a handle (e.g. dmacias.bsky.social) to its DID. */
export async function resolveHandle(fetchImpl: FetchImpl, handle: string): Promise<string> {
  const clean = normalizeHandle(handle);
  const url = `${BLUESKY_API_BASE}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(clean)}`;
  const data = await fetchJson(fetchImpl, url);
  if (!isRecord(data) || typeof data.did !== "string" || !data.did.startsWith("did:")) {
    throw new BlueskyError(`resolveHandle returned no DID for ${clean}`);
  }
  return data.did;
}

/** Fetch an author's feed. Returns the raw `feed` array (un-normalized). */
export async function fetchAuthorFeed(
  fetchImpl: FetchImpl,
  did: string,
  filter: FeedFilter,
  limit: number,
): Promise<unknown[]> {
  const url =
    `${BLUESKY_API_BASE}/app.bsky.feed.getAuthorFeed` +
    `?actor=${encodeURIComponent(did)}&filter=${encodeURIComponent(filter)}&limit=${limit}`;
  const data = await fetchJson(fetchImpl, url);
  if (!isRecord(data) || !Array.isArray(data.feed)) {
    throw new BlueskyError("getAuthorFeed returned no feed array");
  }
  return data.feed;
}

/** Fetch one or more posts by AT URI. Returns the raw `posts` array. */
export async function fetchPostsByUri(fetchImpl: FetchImpl, uris: string[]): Promise<unknown[]> {
  const params = uris.map((uri) => `uris[]=${encodeURIComponent(uri)}`).join("&");
  const url = `${BLUESKY_API_BASE}/app.bsky.feed.getPosts?${params}`;
  const data = await fetchJson(fetchImpl, url);
  if (!isRecord(data) || !Array.isArray(data.posts)) {
    throw new BlueskyError("getPosts returned no posts array");
  }
  return data.posts;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Only http(s) URLs are safe to render as links or media. Anything else
 * (notably `javascript:`) is dropped. Bluesky's API only checks that a URI
 * is well-formed, and `javascript:alert(1)` is one, so author-controlled
 * URIs must be allowlisted here before they reach an <a href> or <img src>.
 */
function isSafeHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/** The URL when it is a safe http(s) URL, otherwise undefined. */
function safeHttpUrl(value: string | undefined): string | undefined {
  return isSafeHttpUrl(value) ? value : undefined;
}

/** A post record key (TID): 13 chars from the base32-sortable alphabet. */
const TID_RE = /^[2-7a-z]{13}$/;

/** A Bluesky handle is a domain name: dot-separated labels. */
const HANDLE_RE =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** A DID: `did:<method>:<method-specific-id>`. */
const DID_RE = /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/;

function isValidHandleOrDid(value: string): boolean {
  if (value.length > 253) return false;
  if (value.startsWith("did:")) return DID_RE.test(value);
  return HANDLE_RE.test(value);
}

/**
 * Extract the rkey from an AT URI like
 * at://did:plc:…/app.bsky.feed.post/<rkey>.
 */
export function rkeyFromUri(uri: string): string | null {
  const match = uri.match(/^at:\/\/[^/]+\/app\.bsky\.feed\.post\/([^/]+)$/);
  return match ? match[1] : null;
}

/** Build the public bsky.app URL for a post. */
export function postUrl(authorHandle: string, uri: string): string {
  const rkey = rkeyFromUri(uri);
  if (!rkey) return `${BSKY_APP_BASE}/profile/${authorHandle}`;
  return `${BSKY_APP_BASE}/profile/${authorHandle}/post/${rkey}`;
}

/**
 * Parse a bsky.app post URL into its handle (or DID) and rkey.
 * Accepts https://bsky.app/profile/<handle-or-did>/post/<rkey> with or
 * without a trailing slash. Returns null for anything else.
 */
export function parsePostUrl(url: string): { handleOrDid: string; rkey: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.hostname !== "bsky.app") return null;
  const match = parsed.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)\/?$/);
  if (!match) return null;
  const handleOrDid = decodeURIComponent(match[1]);
  const rkey = match[2];
  // Reject malformed input before any network call: the rkey must be a
  // 13-char TID and the handle/DID must have valid syntax. This keeps the
  // public post endpoint from being used to trigger lookups for junk.
  if (!isValidHandleOrDid(handleOrDid) || !TID_RE.test(rkey)) return null;
  return { handleOrDid, rkey };
}

/**
 * Turn post text + facets into linkified segments.
 *
 * Facet indexes are UTF-8 BYTE offsets, not JS string indexes, so the text
 * is sliced as bytes and decoded back. Facets are sorted, and any facet
 * that overlaps an earlier one or runs past the end of the text is skipped
 * rather than breaking the render.
 */
export function linkifyText(text: string, facets: unknown): TextSegment[] {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(text);
  const segments: TextSegment[] = [];

  const list = Array.isArray(facets) ? facets : [];
  const sorted = list
    .filter(isRecord)
    .map((facet) => {
      const index = isRecord(facet.index) ? facet.index : null;
      if (!index || typeof index.byteStart !== "number" || typeof index.byteEnd !== "number") {
        return null;
      }
      return {
        byteStart: index.byteStart,
        byteEnd: index.byteEnd,
        features: Array.isArray(facet.features) ? facet.features : [],
      };
    })
    .filter(
      (entry): entry is NonNullable<typeof entry> =>
        entry !== null &&
        entry.byteStart >= 0 &&
        entry.byteEnd > entry.byteStart &&
        entry.byteEnd <= bytes.length,
    )
    .sort((a, b) => a.byteStart - b.byteStart);

  const pushText = (start: number, end: number, href?: string) => {
    if (end <= start) return;
    const chunk = decoder.decode(bytes.subarray(start, end));
    if (!chunk) return;
    if (href) segments.push({ text: chunk, href });
    else segments.push({ text: chunk });
  };

  let cursor = 0;
  for (const facet of sorted) {
    if (facet.byteStart < cursor) continue; // overlapping facet: skip
    pushText(cursor, facet.byteStart);
    const href = hrefForFacet(facet.features);
    pushText(facet.byteStart, facet.byteEnd, href);
    cursor = facet.byteEnd;
  }
  pushText(cursor, bytes.length);
  return segments;
}

function hrefForFacet(features: unknown[]): string | undefined {
  for (const feature of features) {
    if (!isRecord(feature)) continue;
    if (feature.$type === "app.bsky.richtext.facet#link" && typeof feature.uri === "string") {
      // Only http(s) links are kept; anything else (notably `javascript:`)
      // is dropped, so the segment renders as plain text.
      return isSafeHttpUrl(feature.uri) ? feature.uri : undefined;
    }
    if (feature.$type === "app.bsky.richtext.facet#mention" && typeof feature.did === "string") {
      return `${BSKY_APP_BASE}/profile/${feature.did}`;
    }
    if (feature.$type === "app.bsky.richtext.facet#tag" && typeof feature.tag === "string") {
      return `${BSKY_APP_BASE}/hashtag/${encodeURIComponent(feature.tag)}`;
    }
  }
  return undefined;
}

/**
 * Normalize one feed item (`{ post, reason?, reply? }`) from getAuthorFeed.
 * Returns null for items that cannot be rendered (e.g. a blocked post
 * whose record is missing). Reposts are kept and marked with `repostedBy*`
 * — the caller decides whether to show or filter them.
 */
export function normalizeFeedItem(item: unknown): NormalizedPost | null {
  if (!isRecord(item) || !isRecord(item.post)) return null;
  const post = normalizePostView(item.post);
  if (!post) return null;

  const reason = isRecord(item.reason) ? item.reason : null;
  if (reason && reason.$type === "app.bsky.feed.defs#reasonRepost" && isRecord(reason.by)) {
    post.repostedByHandle = asString(reason.by.handle);
    post.repostedByDisplayName = asString(reason.by.displayName);
  }
  return post;
}

/** Normalize a raw post view (from getAuthorFeed `post` or getPosts `posts[]`). */
export function normalizePostView(post: unknown): NormalizedPost | null {
  if (!isRecord(post)) return null;
  const record = isRecord(post.record) ? post.record : null;
  const author = isRecord(post.author) ? post.author : null;
  const text = record ? asString(record.text) : undefined;
  const createdAt = record ? asString(record.createdAt) : undefined;
  const uri = asString(post.uri);
  const handle = author ? asString(author.handle) : undefined;
  if (!text || !createdAt || !uri || !handle || !author || !record) return null;

  const normalized: NormalizedPost = {
    uri,
    url: postUrl(handle, uri),
    authorHandle: handle,
    authorDisplayName: asString(author.displayName) ?? handle,
    authorAvatar: safeHttpUrl(asString(author.avatar)),
    text,
    segments: linkifyText(text, record.facets),
    createdAt,
    likeCount: asCount(post.likeCount),
    repostCount: asCount(post.repostCount),
    replyCount: asCount(post.replyCount),
  };

  const embed = normalizeEmbed(isRecord(post.embed) ? post.embed : null, author);
  if (embed.images) normalized.images = embed.images;
  if (embed.external) normalized.external = embed.external;
  if (embed.quote) normalized.quote = embed.quote;
  return normalized;
}

interface NormalizedEmbed {
  images?: NormalizedImage[];
  external?: NormalizedExternal;
  quote?: NormalizedPost;
}

/**
 * Normalize a post embed view. v1 handles images, external link cards, and
 * quote posts (including record-with-media). Video embeds are deliberately
 * not rendered in v1 — the post text still shows, and the card links out
 * to bsky.app where the video plays.
 */
function normalizeEmbed(
  embed: Record<string, unknown> | null,
  _author: Record<string, unknown> | null,
): NormalizedEmbed {
  if (!embed || typeof embed.$type !== "string") return {};
  switch (embed.$type) {
    case "app.bsky.embed.images#view": {
      const images = normalizeImages(embed.images);
      return images.length ? { images } : {};
    }
    case "app.bsky.embed.external#view": {
      const external = normalizeExternal(embed.external);
      return external ? { external } : {};
    }
    case "app.bsky.embed.record#view": {
      const quote = normalizeRecordView(embed.record);
      return quote ? { quote } : {};
    }
    case "app.bsky.embed.recordWithMedia#view": {
      const quote = normalizeRecordView(embed.record);
      const media = normalizeEmbed(isRecord(embed.media) ? embed.media : null, null);
      return { ...(quote ? { quote } : {}), ...media };
    }
    default:
      // app.bsky.embed.video#view and anything unknown: render text only.
      return {};
  }
}

function normalizeImages(value: unknown): NormalizedImage[] {
  if (!Array.isArray(value)) return [];
  const out: NormalizedImage[] = [];
  for (const image of value) {
    if (!isRecord(image)) continue;
    const thumb = asString(image.thumb);
    const fullsize = asString(image.fullsize);
    if (!isSafeHttpUrl(thumb) || !isSafeHttpUrl(fullsize)) continue;
    out.push({ thumb, fullsize, alt: asString(image.alt) ?? "" });
  }
  return out;
}

function normalizeExternal(value: unknown): NormalizedExternal | null {
  if (!isRecord(value)) return null;
  const uri = asString(value.uri);
  const title = asString(value.title);
  if (!isSafeHttpUrl(uri) || !title) return null;
  return {
    uri,
    title,
    description: asString(value.description) ?? "",
    thumb: safeHttpUrl(asString(value.thumb)),
  };
}

/**
 * Normalize a quoted record view (`record#view`'s inner `record`).
 * Returns null for blocked / not-found / detached records, which carry no
 * usable text. Accepts either the record itself or a `record#view` wrapper
 * (recordWithMedia nests the wrapper one level deeper).
 */
function normalizeRecordView(record: unknown): NormalizedPost | null {
  if (!isRecord(record)) return null;
  // Unwrap a record#view wrapper, e.g. inside recordWithMedia#view.
  const target: Record<string, unknown> =
    record.$type === "app.bsky.embed.record#view" && isRecord(record.record)
      ? record.record
      : record;
  // Blocked, not-found, and detached records have no `value` with text.
  const value = isRecord(target.value) ? target.value : null;
  const author = isRecord(target.author) ? target.author : null;
  const text = value ? asString(value.text) : undefined;
  const createdAt = value ? asString(value.createdAt) : undefined;
  const uri = asString(target.uri);
  const handle = author ? asString(author.handle) : undefined;
  if (!text || !createdAt || !uri || !handle || !author || !value) return null;

  const normalized: NormalizedPost = {
    uri,
    url: postUrl(handle, uri),
    authorHandle: handle,
    authorDisplayName: asString(author.displayName) ?? handle,
    authorAvatar: safeHttpUrl(asString(author.avatar)),
    text,
    segments: linkifyText(text, value.facets),
    createdAt,
    likeCount: 0,
    repostCount: 0,
    replyCount: 0,
  };

  // A quote can itself carry an images/external embed (one level only).
  if (Array.isArray(target.embeds)) {
    for (const inner of target.embeds) {
      if (!isRecord(inner)) continue;
      const nested = normalizeEmbed(inner, null);
      if (nested.images && !normalized.images) normalized.images = nested.images;
      if (nested.external && !normalized.external) normalized.external = nested.external;
      if (nested.images || nested.external) break;
    }
  }
  return normalized;
}
