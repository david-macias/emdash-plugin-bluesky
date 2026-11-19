/**
 * emdash-plugin-bluesky — native EmDash plugin.
 *
 * Renders a Bluesky feed or a single Bluesky post on the public site, using
 * only the Bluesky public API (no auth, no secrets). The feed is refreshed
 * in the background by a cron task and served from KV; rendering never
 * touches the network, so a Bluesky outage can never break a page.
 *
 * Entry point contract (verified against installed EmDash 1.5.0):
 * - The host imports the named `createPlugin` export from the descriptor's
 *   entrypoint and calls it with the descriptor's options.
 * - `definePlugin` validates the id (simple `^[a-z0-9-]+$`), the semver
 *   version, and capabilities against PLUGIN_CAPABILITIES.
 */

import { definePlugin } from "emdash";
import type { RouteContext } from "emdash";
import { CRON_TASK_NAME, PLUGIN_ID, PLUGIN_VERSION } from "./constants.js";
import { getFeed, getSinglePost, loadSettings, refreshFeed, scheduleRefresh } from "./refresh.js";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  SETTINGS_SCHEMA,
} from "./settings.js";

/** Descriptor options. Reserved for future use; the plugin is configured via admin settings. */
export interface BlueskyPluginOptions {
  // Intentionally empty for v1.
}

/** The plugin definition, built by `createPlugin()`. Exported for tests. */
export function buildPluginDefinition() {
  return definePlugin({
    id: PLUGIN_ID,
    displayName: "Bluesky",
    description: "Show a Bluesky feed or a single Bluesky post on your site.",
    version: PLUGIN_VERSION,
    capabilities: ["network:request"],
    allowedHosts: ["public.api.bsky.app"],

    hooks: {
      /**
       * Seed the schema defaults into the settings store. EmDash renders the
       * defaults in the admin form but does not write them to the store, so
       * without this a fresh install reads null for every key. `readSettings`
       * still applies defaults defensively — this is belt and suspenders.
       */
      "plugin:install": async (_event, ctx) => {
        for (const key of SETTINGS_KEYS) {
          try {
            const existing = await ctx.settings.get(key);
            if (existing === null || existing === undefined) {
              await ctx.settings.set(key, DEFAULT_SETTINGS[key]);
            }
          } catch (cause) {
            ctx.log.warn(`[${PLUGIN_ID}] failed to seed setting ${key}`, cause);
          }
        }
        ctx.log.info(`[${PLUGIN_ID}] installed; defaults seeded`);
      },

      /** Schedule the background refresh (upsert — safe to re-run). */
      "plugin:activate": async (_event, ctx) => {
        await scheduleRefresh(ctx);
      },

      /** Stop the background refresh when the plugin is disabled. */
      "plugin:deactivate": async (_event, ctx) => {
        if (!ctx.cron) return;
        try {
          await ctx.cron.cancel(CRON_TASK_NAME);
        } catch (cause) {
          ctx.log.warn(`[${PLUGIN_ID}] failed to cancel refresh task`, cause);
        }
      },

      /**
       * Cron tick: refresh the cached feed, then re-sync the schedule in
       * case `refreshMinutes` changed since the last run.
       */
      cron: async (event, ctx) => {
        if (event.name !== CRON_TASK_NAME) return;
        await refreshFeed(ctx);
        await scheduleRefresh(ctx);
      },
    },

    routes: {
      /**
       * Public feed route: GET /_emdash/api/plugins/emdash-plugin-bluesky/feed
       * Optional query param `limit` (1-25, defaults to the postCount
       * setting). Serves the KV cache, refreshing inline when stale, so
       * the feed stays fresh even if the cron task never fires.
       * The response is wrapped by the runtime in { success, data }.
       */
      feed: {
        public: true,
        methods: ["GET"],
        cacheControl: "public, max-age=60, stale-while-revalidate=300",
        request: { body: "none" },
        handler: async (ctx: RouteContext) => {
          const settings = await loadSettings(ctx);
          const limit = limitFromInput(ctx.input, settings.postCount);
          return getFeed(ctx, limit);
        },
      },

      /**
       * Public single-post route:
       * GET /_emdash/api/plugins/emdash-plugin-bluesky/post?url=<bsky.app post URL>
       * KV-cached like the feed. Returns { post: null } when the URL is not
       * a Bluesky post URL or the post cannot be fetched.
       */
      post: {
        public: true,
        methods: ["GET"],
        cacheControl: "public, max-age=300, stale-while-revalidate=600",
        request: { body: "none" },
        handler: async (ctx: RouteContext) => {
          const url = urlFromInput(ctx.input);
          if (!url) return { post: null, fetchedAt: null };
          return getSinglePost(ctx, url);
        },
      },

      /**
       * Private manual refresh: POST /_emdash/api/plugins/emdash-plugin-bluesky/refresh
       * Requires the plugins:manage permission (admin only). Forces a
       * Bluesky fetch and rewrites the cache.
       */
      refresh: {
        methods: ["POST"],
        permission: "plugins:manage",
        request: { body: "none" },
        handler: async (ctx: RouteContext) => refreshFeed(ctx),
      },
    },

    admin: {
      settingsSchema: SETTINGS_SCHEMA,
      portableTextBlocks: [
        {
          type: "bluesky-feed",
          label: "Bluesky feed",
          icon: "link-external",
          description: "Latest posts from your Bluesky account.",
          category: "Embeds",
          fields: [
            {
              type: "number_input",
              action_id: "count",
              label: "Posts to show",
              min: 1,
              max: 20,
            },
          ],
        },
        {
          type: "bluesky-post",
          label: "Bluesky post",
          icon: "link",
          description: "Embed a single Bluesky post.",
          placeholder: "Paste a Bluesky post URL...",
          category: "Embeds",
          fields: [
            {
              type: "text_input",
              action_id: "id",
              label: "Post URL",
              placeholder: "https://bsky.app/profile/you.bsky.social/post/…",
            },
          ],
        },
      ],
    },
  });
}

/**
 * Native entrypoint: the host calls `createPlugin(descriptor.options)`.
 * Options are unused in v1 (configuration lives in admin settings).
 */
export function createPlugin(_options: BlueskyPluginOptions = {}) {
  return buildPluginDefinition();
}

export default createPlugin;

/** Parse the feed route's `limit` query param; fall back to the setting. */
function limitFromInput(input: unknown, fallback: number): number {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const raw = (input as Record<string, unknown>).limit;
    const n =
      typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : Number.NaN;
    if (Number.isFinite(n)) return Math.max(1, Math.min(25, Math.floor(n)));
  }
  return fallback;
}

/** Parse the post route's `url` query param. */
function urlFromInput(input: unknown): string | null {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const raw = (input as Record<string, unknown>).url;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}
