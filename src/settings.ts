/**
 * Plugin settings: schema (rendered as the admin form by EmDash), defaults,
 * and the defensive reader that applies those defaults.
 *
 * Important EmDash behavior (verified against the installed 1.5.0 types):
 * the schema's `default` values fill the generated admin form, but EmDash
 * does NOT write them into the settings store. A fresh install therefore
 * reads `null` for every key until the admin saves the form, so all code
 * must read through `readSettings()`, which applies defaults itself.
 * `plugin:install` also seeds the defaults into the store (see plugin.ts),
 * but the reader stays defensive either way.
 */

import type { SettingField } from "emdash";
import { FEED_FILTERS, normalizeHandle, type FeedFilter } from "./bluesky.js";
import type { FeedPosition } from "./types.js";

export const FEED_POSITIONS = ["left", "right", "below"] as const;

export interface BlueskySettings {
  /** Bluesky handle to show, e.g. dmacias.bsky.social. Empty = disabled. */
  handle: string;
  /** How many posts the feed block shows by default. */
  postCount: number;
  /** Show reposts in the feed (with a "reposted by" marker). */
  includeReposts: boolean;
  /** Which getAuthorFeed filter the refresh uses. */
  filter: FeedFilter;
  /** Minutes between background refreshes. */
  refreshMinutes: number;
  /** Show like / repost / reply counts on cards. */
  showCounts: boolean;
  /** Show attached images on cards. */
  showImages: boolean;
  /** Where the homepage feed renders (read by the site template). */
  position: FeedPosition;
  /** Where the /posts feed renders (read by the archive template). */
  postsPosition: FeedPosition;
  /** Where the single-post feed renders (read by the post template). */
  postPosition: FeedPosition;
}

export const DEFAULT_SETTINGS: BlueskySettings = {
  handle: "",
  postCount: 5,
  includeReposts: false,
  filter: "posts_no_replies",
  refreshMinutes: 15,
  showCounts: true,
  showImages: true,
  position: "right",
  postsPosition: "below",
  postPosition: "right",
};

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof BlueskySettings)[];

/** The admin settings form, rendered automatically by EmDash (keyed by setting name). */
export const SETTINGS_SCHEMA: Record<string, SettingField> = {
  handle: {
    type: "string",
    label: "Bluesky handle",
    description:
      "The account whose posts are shown, e.g. dmacias.bsky.social. A leading @ is ignored. Leave empty to disable the feed.",
  },
  postCount: {
    type: "number",
    label: "Posts to show",
    description: "How many posts the feed block shows by default (1-20).",
    default: DEFAULT_SETTINGS.postCount,
    min: 1,
    max: 20,
  },
  includeReposts: {
    type: "boolean",
    label: "Include reposts",
    description: "When on, reposts appear in the feed with a “reposted by” marker.",
    default: DEFAULT_SETTINGS.includeReposts,
  },
  filter: {
    type: "select",
    label: "Feed filter",
    description: "Which posts the background refresh pulls from Bluesky.",
    options: [
      { value: "posts_no_replies", label: "Posts, no replies" },
      { value: "posts_with_replies", label: "Posts with replies" },
      { value: "posts_with_media", label: "Posts with media" },
      { value: "posts_and_author_threads", label: "Posts and author threads" },
      { value: "posts_with_video", label: "Posts with video" },
    ],
    default: DEFAULT_SETTINGS.filter,
  },
  refreshMinutes: {
    type: "number",
    label: "Refresh every (minutes)",
    description: "How often the cached feed is refreshed in the background (1-1440).",
    default: DEFAULT_SETTINGS.refreshMinutes,
    min: 1,
    max: 1440,
  },
  showCounts: {
    type: "boolean",
    label: "Show counts",
    description: "Show like, repost, and reply counts on each post.",
    default: DEFAULT_SETTINGS.showCounts,
  },
  showImages: {
    type: "boolean",
    label: "Show images",
    description: "Show images attached to posts.",
    default: DEFAULT_SETTINGS.showImages,
  },
  position: {
    type: "select",
    label: "Feed position",
    description:
      "Where the feed appears on the homepage. The template reads this on every render, so changing it takes effect immediately.",
    options: [
      { value: "left", label: "Left sidebar" },
      { value: "right", label: "Right sidebar" },
      { value: "below", label: "Below the posts" },
    ],
    default: DEFAULT_SETTINGS.position,
  },
  postsPosition: {
    type: "select",
    label: "Posts page feed position",
    description:
      "Where the feed appears on the /posts archive page. Read by the archive template on every render.",
    options: [
      { value: "left", label: "Left sidebar" },
      { value: "right", label: "Right sidebar" },
      { value: "below", label: "Below the posts" },
    ],
    default: DEFAULT_SETTINGS.postsPosition,
  },
  postPosition: {
    type: "select",
    label: "Single post feed position",
    description:
      "Where the feed appears on a single post page. Read by the post template on every render.",
    options: [
      { value: "left", label: "Left sidebar" },
      { value: "right", label: "Right sidebar" },
      { value: "below", label: "Below the post" },
    ],
    default: DEFAULT_SETTINGS.postPosition,
  },
};

/**
 * Read settings defensively: any missing, null, or wrong-typed value falls
 * back to its default, and numbers are clamped to their schema ranges.
 * `raw` is the map of stored values (from ctx.settings.get per key).
 */
export function readSettings(raw: Record<string, unknown> | null | undefined): BlueskySettings {
  const source = raw ?? {};
  const handle = typeof source.handle === "string" ? normalizeHandle(source.handle) : "";
  const postCount = clampNumber(source.postCount, 1, 20, DEFAULT_SETTINGS.postCount);
  const includeReposts =
    typeof source.includeReposts === "boolean"
      ? source.includeReposts
      : DEFAULT_SETTINGS.includeReposts;
  const filter =
    typeof source.filter === "string" && (FEED_FILTERS as readonly string[]).includes(source.filter)
      ? (source.filter as FeedFilter)
      : DEFAULT_SETTINGS.filter;
  const refreshMinutes = clampNumber(
    source.refreshMinutes,
    1,
    1440,
    DEFAULT_SETTINGS.refreshMinutes,
  );
  const showCounts =
    typeof source.showCounts === "boolean" ? source.showCounts : DEFAULT_SETTINGS.showCounts;
  const showImages =
    typeof source.showImages === "boolean" ? source.showImages : DEFAULT_SETTINGS.showImages;
  const position =
    typeof source.position === "string" &&
    (FEED_POSITIONS as readonly string[]).includes(source.position)
      ? (source.position as FeedPosition)
      : DEFAULT_SETTINGS.position;
  const postsPosition =
    typeof source.postsPosition === "string" &&
    (FEED_POSITIONS as readonly string[]).includes(source.postsPosition)
      ? (source.postsPosition as FeedPosition)
      : DEFAULT_SETTINGS.postsPosition;
  const postPosition =
    typeof source.postPosition === "string" &&
    (FEED_POSITIONS as readonly string[]).includes(source.postPosition)
      ? (source.postPosition as FeedPosition)
      : DEFAULT_SETTINGS.postPosition;
  return {
    handle,
    postCount,
    includeReposts,
    filter,
    refreshMinutes,
    showCounts,
    showImages,
    position,
    postsPosition,
    postPosition,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Cron expression for a refresh every `minutes` minutes (UTC, via croner).
 * For example, 15 produces an expression that runs at :00, :15, :30, :45.
 */
export function cronExpressionFor(minutes: number): string {
  const m = clampNumber(minutes, 1, 1440, DEFAULT_SETTINGS.refreshMinutes);
  return `*/${m} * * * *`;
}
