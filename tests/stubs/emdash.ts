/**
 * Minimal stand-in for the "emdash" package, used only by vitest.
 *
 * The real emdash package pulls in the whole CMS graph, which is too heavy
 * (and too side-effectful) for unit tests. The plugin's runtime code only
 * needs `definePlugin` to return its definition unchanged, so that is what
 * this stub does. The REAL definePlugin — including its id/capability
 * validation — is exercised separately by scripts/smoke.mjs against the
 * installed emdash 1.5.0 package.
 */

export function definePlugin(definition: Record<string, unknown>): Record<string, unknown> {
  return { ...definition, __stub: true };
}

export function definePluginRoute(route: Record<string, unknown>): Record<string, unknown> {
  return route;
}
