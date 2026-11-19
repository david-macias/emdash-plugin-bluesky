/**
 * Smoke check for the BUILT package (dist/) against the REAL EmDash 1.5.0
 * validation rules.
 *
 * The real "emdash" entry cannot be imported in plain node (its bundle
 * imports `cloudflare:workers` and `astro:content`), so this script loads
 * the built dist with "emdash" redirected to a passthrough stub
 * (scripts/loader.mjs), then validates the resulting definition against:
 * - the id/version regexes from src/plugins/define-plugin.ts
 *   (SIMPLE_ID / SCOPED_ID / SEMVER_PATTERN), and
 * - the real PLUGIN_CAPABILITIES list from @emdash-cms/plugin-types
 *   (the same list definePlugin checks capabilities against).
 *
 * Run after `npm run build`:
 *
 *   node scripts/smoke.mjs
 */
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./loader.mjs", import.meta.url);

const emdashPkg = JSON.parse(
  readFileSync(new URL("../node_modules/emdash/package.json", import.meta.url), "utf-8"),
);
console.log(`emdash version under test: ${emdashPkg.version}`);

const { PLUGIN_CAPABILITIES } = await import("@emdash-cms/plugin-types");
const { createPlugin, blueskyPlugin } = await import("../dist/index.js");

// Regexes copied verbatim from emdash 1.5.0 src/plugins/define-plugin.ts
// (defineNativePlugin). They are the exact checks the host runs.
const SIMPLE_ID = /^[a-z0-9-]+$/;
const SCOPED_ID = /^@[a-z0-9-]+\/[a-z0-9-]+$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+/;

const assert = (cond, msg) => {
  if (!cond) throw new Error(`SMOKE FAILED: ${msg}`);
};

const plugin = createPlugin();
console.log("--- createPlugin() ---");
console.log("id:", plugin.id);
console.log("version:", plugin.version);
console.log("displayName:", plugin.displayName);
console.log("capabilities:", JSON.stringify(plugin.capabilities));
console.log("allowedHosts:", JSON.stringify(plugin.allowedHosts));
console.log("routes:", Object.keys(plugin.routes).join(", "));
console.log("hooks:", Object.keys(plugin.hooks).join(", "));
console.log("settings keys:", Object.keys(plugin.admin.settingsSchema).join(", "));
console.log(
  "blocks:",
  plugin.admin.portableTextBlocks.map((b) => `${b.type} (${b.label})`).join(", "),
);

assert(plugin.id === "emdash-plugin-bluesky", "id mismatch");
assert(SIMPLE_ID.test(plugin.id) || SCOPED_ID.test(plugin.id), "id fails the real definePlugin regex");
assert(SEMVER_PATTERN.test(plugin.version), "version fails the real definePlugin semver check");
for (const cap of plugin.capabilities) {
  assert(
    PLUGIN_CAPABILITIES.includes(cap),
    `capability ${cap} is not in the real PLUGIN_CAPABILITIES list`,
  );
}
assert(plugin.routes.feed.public === true, "feed route must be public");
assert(plugin.routes.post.public === true, "post route must be public");
assert(plugin.routes.refresh.permission === "plugins:manage", "refresh route permission");
assert(plugin.routes.refresh.methods.includes("POST"), "refresh route must be POST");
assert(plugin.hooks["plugin:install"], "missing plugin:install hook");
assert(plugin.hooks["plugin:activate"], "missing plugin:activate hook");
assert(plugin.hooks.cron, "missing cron hook");
assert(plugin.admin.portableTextBlocks.length === 2, "expected 2 blocks");
assert(
  Object.keys(plugin.admin.settingsSchema).length === 7,
  "expected 7 settings keys",
);

const descriptor = blueskyPlugin();
console.log("--- blueskyPlugin() ---");
console.log(JSON.stringify(descriptor, null, 2));
assert(descriptor.format === "native", "descriptor format must be native");
assert(descriptor.entrypoint === "emdash-plugin-bluesky", "entrypoint mismatch");
assert(descriptor.componentsEntry === "emdash-plugin-bluesky/astro", "componentsEntry mismatch");

// The "./astro" entry re-exports the .astro components; the built JS must
// keep the .astro import specifiers for the host's Astro compiler.
const astroEntry = readFileSync(new URL("../dist/astro/index.js", import.meta.url), "utf-8");
assert(astroEntry.includes("../../astro/BlueskyFeed.astro"), "astro entry must import BlueskyFeed.astro");
assert(astroEntry.includes("../../astro/BlueskyPost.astro"), "astro entry must import BlueskyPost.astro");
assert(astroEntry.includes("blockComponents"), "astro entry must export blockComponents");
console.log("--- dist/astro/index.js references the .astro components ---");

console.log("SMOKE OK");
