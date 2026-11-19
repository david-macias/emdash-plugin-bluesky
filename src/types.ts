/**
 * Public data shapes shared between the plugin runtime (src/) and the
 * Astro components (astro/). This module has no imports, so it can be
 * published as the package's "./types" export and imported by .astro
 * files without pulling in any runtime code.
 */

/** One linkified run of post text. `href` is absent for plain text. */
export interface TextSegment {
  text: string;
  href?: string;
}

/** A Bluesky image from an images embed (thumbnails for the feed). */
export interface NormalizedImage {
  thumb: string;
  fullsize: string;
  alt: string;
}

/** An external link card attached to a post. */
export interface NormalizedExternal {
  uri: string;
  title: string;
  description: string;
  thumb?: string;
}

/** A single normalized Bluesky post, ready to render. */
export interface NormalizedPost {
  /** AT URI, e.g. at://did:plc:…/app.bsky.feed.post/<rkey> */
  uri: string;
  /** Public bsky.app URL for the post. */
  url: string;
  authorHandle: string;
  authorDisplayName: string;
  authorAvatar?: string;
  /** Raw post text (kept for copying / debugging; render `segments`). */
  text: string;
  /** Text split into plain runs and facet links (mentions, links, tags). */
  segments: TextSegment[];
  /** ISO 8601 timestamp. */
  createdAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  /** Set when this feed item is a repost: who reposted it. */
  repostedByHandle?: string;
  repostedByDisplayName?: string;
  images?: NormalizedImage[];
  external?: NormalizedExternal;
  /** Nested quoted post (one level only; quotes of quotes are not expanded). */
  quote?: NormalizedPost;
}

/** Where the homepage feed renders: left sidebar, right sidebar, or below the posts. */
export type FeedPosition = "left" | "right" | "below";

/** What the public `feed` route returns (inside the runtime's data envelope). */
export interface FeedResponse {
  handle: string;
  did: string;
  /** ISO timestamp of the last successful Bluesky fetch, or null if never. */
  fetchedAt: string | null;
  /** True when the data is older than the configured refresh interval. */
  stale: boolean;
  /** The configured homepage position; the template renders from this. */
  position: FeedPosition;
  posts: NormalizedPost[];
}

/** What the public `post` route returns (inside the runtime's data envelope). */
export interface SinglePostResponse {
  /** Null when the post could not be found or fetched. */
  post: NormalizedPost | null;
  fetchedAt: string | null;
}

/** Cached feed as stored in KV under `cache:feed`. */
export interface CachedFeed {
  version: 1;
  handle: string;
  did: string;
  /** The `filter` setting the cached posts were fetched with. */
  filter: string;
  fetchedAt: string;
  posts: NormalizedPost[];
}

/** Cached single post as stored in KV under `cache:post:<did>:<rkey>`. */
export interface CachedPost {
  version: 1;
  fetchedAt: string;
  post: NormalizedPost;
}

/** Cached DID lookup as stored in KV under `cache:did:<handle>`. */
export interface CachedDid {
  handle: string;
  did: string;
  resolvedAt: string;
}
