/**
 * Astro entry point (the "./astro" export).
 *
 * The host's Portable Text integration statically imports `blockComponents`
 * from this module and merges it into `<PortableText>`, so editor blocks
 * of type `bluesky-feed` / `bluesky-post` render with these components.
 *
 * The same components are exported by name for direct use in site
 * templates (Portable Text blocks cannot go into a template):
 *
 *   import { BlueskyFeed } from "emdash-plugin-bluesky/astro";
 *   <BlueskyFeed count={5} />
 *
 * The .astro files are shipped as source under astro/ and compiled by the
 * host's Astro build; this file only re-exports them.
 */
import BlueskyFeed from "../../astro/BlueskyFeed.astro";
import BlueskyPost from "../../astro/BlueskyPost.astro";
export { BlueskyFeed, BlueskyPost };
export declare const blockComponents: {
    "bluesky-feed": unknown;
    "bluesky-post": unknown;
};
//# sourceMappingURL=index.d.ts.map