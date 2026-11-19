# emdash-plugin-bluesky

Show a Bluesky feed or a single Bluesky post on an [EmDash](https://emdashcms.com) site. Native EmDash plugin, no API key needed: it reads the Bluesky public API (no auth) and caches the result, so a Bluesky outage can never break a page.

> Status: v1.0.3. Built for EmDash 1.5.x. Screenshots: TBD (see below).

## Install

```bash
npm install github:david-macias/emdash-plugin-bluesky
```

Register the plugin in `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { blueskyPlugin } from "emdash-plugin-bluesky";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [blueskyPlugin()],
    }),
  ],
});
```

Then set the handle in the admin: **Settings → Plugins → Bluesky → Bluesky handle**, e.g. `dmacias.bsky.social`. The feed is empty until a handle is set.

## Settings

| Setting | Default | Notes |
|---|---|---|
| Bluesky handle | _(empty)_ | Account to show, e.g. `dmacias.bsky.social`. Empty disables the feed. |
| Posts to show | 5 | Default count for the feed block (1–20). |
| Include reposts | off | When on, reposts appear with a "Reposted by" marker. |
| Feed filter | Posts, no replies | Which posts the refresh pulls (`posts_no_replies`, `posts_with_replies`, `posts_with_media`, `posts_and_author_threads`, `posts_with_video`). |
| Refresh every (minutes) | 15 | Background refresh interval (1–1440). |
| Show counts | on | Like / repost / reply counts on each card. |
| Show images | on | Images attached to posts. |
| Feed position | Right sidebar | Where the feed appears on the homepage: left sidebar, right sidebar, or below the posts. Read by the site template on every render, so changing it takes effect immediately (no redeploy). |
| Posts page feed position | Below the posts | Where the feed appears on the /posts archive page. |
| Single post feed position | Below the post | Where the feed appears on a single post page. |

Schema defaults fill the admin form, but EmDash does not write them to the settings store on install; the plugin seeds them on `plugin:install` and applies defaults defensively on every read, so a fresh install works before the form is ever saved.

## Blocks (editor)

Two blocks appear in the editor slash menu under **Embeds**:

- **Bluesky feed** — the latest posts from the configured handle. Optional "Posts to show" field overrides the setting for that block.
- **Bluesky post** — a single post. Paste a post URL, e.g. `https://bsky.app/profile/dmacias.bsky.social/post/3n2jf3l55g22s`.

An empty feed (account opted out of logged-out visibility, no posts, or Bluesky unreachable with nothing cached) renders nothing, not an error.

## Homepage / template use

Portable Text blocks cannot go into a template, so the plugin also exports importable Astro components from `emdash-plugin-bluesky/astro`:

```astro
---
import { BlueskyFeed, BlueskyPost } from "emdash-plugin-bluesky/astro";
---

<!-- After the post list, before the tag cloud, for example -->
<BlueskyFeed count={5} />

<!-- Or a single post anywhere -->
<BlueskyPost url="https://bsky.app/profile/dmacias.bsky.social/post/3n2jf3l55g22s" />
```

Props: `count` (feed only), `title` (feed only, pass `""` to suppress the heading), `showCounts`, `showImages`. The components read the cached feed through the plugin's public routes; they never call Bluesky directly.

## How freshness works

- A cron task (`bluesky-refresh`, every `refreshMinutes`, UTC) fetches the author's feed via `app.bsky.feed.getAuthorFeed`, normalizes it, and writes it to KV under `cache:feed`. The DID is cached per handle under `cache:did:<handle>` (handles change; DIDs don't). A 400 from the feed fetch triggers one DID re-resolve, in case the handle moved.
- The public `feed` route serves the cache and refreshes inline (stale-while-revalidate) when the cache is missing or older than `refreshMinutes`, so the feed stays fresh even if the cron task never fires under the runner.
- Single posts are cached the same way under `cache:post:<did>:<rkey>`.
- Reposts are stored in the cache and filtered at read time, so toggling "Include reposts" takes effect without a re-fetch. Changing the feed filter marks the cache stale, so the next read re-fetches with the new filter.

## Routes

| Route | Access | Purpose |
|---|---|---|
| `GET /_emdash/api/plugins/emdash-plugin-bluesky/feed?limit=N` | public | Cached feed JSON. `limit` 1–25, defaults to the Posts setting. |
| `GET /_emdash/api/plugins/emdash-plugin-bluesky/post?url=<bsky.app post URL>` | public | One cached post, or `{ post: null }`. |
| `POST /_emdash/api/plugins/emdash-plugin-bluesky/refresh` | `plugins:manage` | Force a background refresh now. |

## Rendering

- Semantic HTML (`article`, `time`, links back to bsky.app). Post text is linkified from Bluesky facets (mentions, links, hashtags), using UTF-8 byte offsets.
- Images from images embeds (thumbnails), external link cards, and nested quote posts (one level). Video embeds are not rendered in v1; the post text still shows and the card links out to bsky.app.
- Styling is scoped per component and inherits the site: no palette is hard-coded, muted text uses opacity, borders use `color-mix` against `currentColor`, and headings use the site's `--font-heading` token when the theme defines one.

## Development

```bash
npm install
npm test          # unit tests (mocked fetch; 41 tests)
npm run test:live # live Bluesky API check (no auth; needs network)
npm run typecheck # tsc --noEmit
npm run build     # tsc -> dist/
npm run smoke     # built-package check against the real EmDash 1.5.0 rules
```

The unit tests run against a small `definePlugin` stub (the real `emdash` entry cannot be imported in plain node: it imports `cloudflare:workers` and `astro:content`). `npm run smoke` loads the built package with `emdash` stubbed and validates the definition against the real id/version regexes from `define-plugin.ts` and the real `PLUGIN_CAPABILITIES` list from `@emdash-cms/plugin-types`.

## Screenshots

TBD — add editor and front-end screenshots here before publishing.

## v1 limits

- Video embeds are not rendered (text + link out only).
- No threads, no reply chains, no pagination beyond the cached pool.
- The feed shows one account (the configured handle); multi-account feeds are out of scope.
- `ctx.cron` firing under the Cloudflare runner, the blocks appearing in the editor slash menu, and the Workers Builds deploy are install-time verifications (see the install checklist in the release notes).

## Changelog

- **1.0.5** — Security and robustness: only http(s) URLs are rendered as links, link cards, images, or avatars (a `javascript:` URI from a reposted or quoted post can no longer become a link on your site); the public single-post endpoint rejects malformed handles and post IDs before any network call, and cached handle lookups expire after 7 days; Bluesky requests time out after 3 seconds, and a failed feed refresh backs off for 60 seconds instead of retrying on every page render.
- **1.0.4** — Single-post feed defaults to below the article.
- **1.0.3** — Per-page feed positions (home, posts list, single post).
- **1.0.2** — Configurable feed position (left, right, below).
- **1.0.1** — Leading `@` in the handle is ignored.

## License

MIT.
