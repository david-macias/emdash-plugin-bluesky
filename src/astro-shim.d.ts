/**
 * Ambient declaration so tsc accepts imports of .astro components from
 * TypeScript (e.g. src/astro/index.ts). At runtime the host's Astro build
 * compiles the .astro files; the emitted JS keeps the import specifiers
 * as-is, so the declaration only affects typechecking.
 */
declare module "*.astro" {
  const Component: unknown;
  export default Component;
}
