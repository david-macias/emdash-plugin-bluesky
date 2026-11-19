/**
 * Package entry point (the "." export).
 *
 * The site registers the plugin by adding the descriptor to `plugins: []`
 * in astro.config.mjs:
 *
 *   import { blueskyPlugin } from "emdash-plugin-bluesky";
 *   export default defineConfig({
 *     integrations: [emdash({ plugins: [blueskyPlugin()] })],
 *   });
 *
 * The descriptor's `entrypoint` is this package itself; the host imports
 * the named `createPlugin` export from it and calls it with the
 * descriptor's options.
 */
import type { PluginDescriptor } from "emdash";
import { createPlugin, type BlueskyPluginOptions } from "./plugin.js";
export { createPlugin, type BlueskyPluginOptions };
export default createPlugin;
/**
 * Descriptor factory. Returns the PluginDescriptor the site adds to its
 * `plugins: []` list. `componentsEntry` points at the "./astro" export,
 * which supplies the Portable Text block components.
 */
export declare function blueskyPlugin(_options?: BlueskyPluginOptions): PluginDescriptor;
//# sourceMappingURL=index.d.ts.map