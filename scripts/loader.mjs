/**
 * Node module-customization hooks for the smoke script.
 * Redirects bare "emdash" imports to the local stub (see stubs/emdash-stub.mjs),
 * because the real emdash entry cannot load in plain node
 * (it imports `cloudflare:workers` and `astro:content`).
 */

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "emdash") {
    return {
      url: new URL("./stubs/emdash-stub.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
