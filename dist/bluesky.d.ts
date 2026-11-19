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
import type { NormalizedPost, TextSegment } from "./types.js";
export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
/** Feed filters accepted by getAuthorFeed. */
export declare const FEED_FILTERS: readonly ["posts_with_replies", "posts_no_replies", "posts_with_media", "posts_and_author_threads", "posts_with_video"];
export type FeedFilter = (typeof FEED_FILTERS)[number];
export declare class BlueskyError extends Error {
    readonly status?: number;
    constructor(message: string, status?: number);
}
/** Resolve a handle (e.g. dmacias.bsky.social) to its DID. */
export declare function resolveHandle(fetchImpl: FetchImpl, handle: string): Promise<string>;
/** Fetch an author's feed. Returns the raw `feed` array (un-normalized). */
export declare function fetchAuthorFeed(fetchImpl: FetchImpl, did: string, filter: FeedFilter, limit: number): Promise<unknown[]>;
/** Fetch one or more posts by AT URI. Returns the raw `posts` array. */
export declare function fetchPostsByUri(fetchImpl: FetchImpl, uris: string[]): Promise<unknown[]>;
/**
 * Extract the rkey from an AT URI like
 * at://did:plc:…/app.bsky.feed.post/<rkey>.
 */
export declare function rkeyFromUri(uri: string): string | null;
/** Build the public bsky.app URL for a post. */
export declare function postUrl(authorHandle: string, uri: string): string;
/**
 * Parse a bsky.app post URL into its handle (or DID) and rkey.
 * Accepts https://bsky.app/profile/<handle-or-did>/post/<rkey> with or
 * without a trailing slash. Returns null for anything else.
 */
export declare function parsePostUrl(url: string): {
    handleOrDid: string;
    rkey: string;
} | null;
/**
 * Turn post text + facets into linkified segments.
 *
 * Facet indexes are UTF-8 BYTE offsets, not JS string indexes, so the text
 * is sliced as bytes and decoded back. Facets are sorted, and any facet
 * that overlaps an earlier one or runs past the end of the text is skipped
 * rather than breaking the render.
 */
export declare function linkifyText(text: string, facets: unknown): TextSegment[];
/**
 * Normalize one feed item (`{ post, reason?, reply? }`) from getAuthorFeed.
 * Returns null for items that cannot be rendered (e.g. a blocked post
 * whose record is missing). Reposts are kept and marked with `repostedBy*`
 * — the caller decides whether to show or filter them.
 */
export declare function normalizeFeedItem(item: unknown): NormalizedPost | null;
/** Normalize a raw post view (from getAuthorFeed `post` or getPosts `posts[]`). */
export declare function normalizePostView(post: unknown): NormalizedPost | null;
//# sourceMappingURL=bluesky.d.ts.map