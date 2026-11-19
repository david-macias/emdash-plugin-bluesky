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
import { PLUGIN_ID, PLUGIN_VERSION } from "./constants.js";
import { createPlugin } from "./plugin.js";
export { createPlugin };
export default createPlugin;
/**
 * Descriptor factory. Returns the PluginDescriptor the site adds to its
 * `plugins: []` list. `componentsEntry` points at the "./astro" export,
 * which supplies the Portable Text block components.
 */
export function blueskyPlugin(_options = {}) {
    return {
        id: PLUGIN_ID,
        version: PLUGIN_VERSION,
        format: "native",
        entrypoint: PLUGIN_ID,
        componentsEntry: `${PLUGIN_ID}/astro`,
        options: {},
    };
}
//# sourceMappingURL=index.js.map