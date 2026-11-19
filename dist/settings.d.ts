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
import { type FeedFilter } from "./bluesky.js";
import type { FeedPosition } from "./types.js";
export declare const FEED_POSITIONS: readonly ["left", "right", "below"];
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
}
export declare const DEFAULT_SETTINGS: BlueskySettings;
export declare const SETTINGS_KEYS: (keyof BlueskySettings)[];
/** The admin settings form, rendered automatically by EmDash (keyed by setting name). */
export declare const SETTINGS_SCHEMA: Record<string, SettingField>;
/**
 * Read settings defensively: any missing, null, or wrong-typed value falls
 * back to its default, and numbers are clamped to their schema ranges.
 * `raw` is the map of stored values (from ctx.settings.get per key).
 */
export declare function readSettings(raw: Record<string, unknown> | null | undefined): BlueskySettings;
/**
 * Cron expression for a refresh every `minutes` minutes (UTC, via croner).
 * For example, 15 produces an expression that runs at :00, :15, :30, :45.
 */
export declare function cronExpressionFor(minutes: number): string;
//# sourceMappingURL=settings.d.ts.map