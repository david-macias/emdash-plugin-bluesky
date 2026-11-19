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
/** Descriptor options. Reserved for future use; the plugin is configured via admin settings. */
export interface BlueskyPluginOptions {
}
/** The plugin definition, built by `createPlugin()`. Exported for tests. */
export declare function buildPluginDefinition(): import("emdash").ResolvedPlugin<import("emdash").PluginStorageConfig>;
/**
 * Native entrypoint: the host calls `createPlugin(descriptor.options)`.
 * Options are unused in v1 (configuration lives in admin settings).
 */
export declare function createPlugin(_options?: BlueskyPluginOptions): import("emdash").ResolvedPlugin<import("emdash").PluginStorageConfig>;
export default createPlugin;
//# sourceMappingURL=plugin.d.ts.map