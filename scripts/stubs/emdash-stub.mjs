/**
 * Minimal "emdash" stand-in for the node smoke script.
 *
 * The real "emdash" entry cannot be imported in plain node: its bundle
 * imports `cloudflare:workers` and `astro:content`, which only exist
 * inside the Workers/Astro runtime. The plugin's runtime code only needs
 * `definePlugin` to return its definition, so this stub passes it through
 * unchanged; scripts/smoke.mjs then validates that definition against the
 * REAL rules (regexes from src/plugins/define-plugin.ts, capability list
 * from @emdash-cms/plugin-types).
 */

export function definePlugin(definition) {
  return { ...definition };
}

export function definePluginRoute(route) {
  return route;
}
