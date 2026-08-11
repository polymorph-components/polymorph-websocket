// The deltic-browser worker's bundle entry for the engine surface:
// upstream's tools/release-bundle/entry.ts public surface, reproduced
// locally now that deltic publishes JSR prereleases instead of a
// pinned raw-URL release bundle (see ../../../README.md's deltic pin
// story and js/deltic/deno.json's MODULE-IDENTITY comment).
//
// Bundled with `deno bundle --platform browser` from THIS directory (so
// every re-export resolves through this directory's deno.json import
// map — the single deltic pin site), the emitted module is what
// browser/worker-entry.ts imports as `@deltic/release-bundle-entry`
// used to. Same export surface: instantiate/Translator/runSuite/
// wasiShims/WitError/artifactsFromEnvelope and friends (49 exports
// verified against the retired upstream entry).
export * from "@deltic/runtime/embedder";
export { Translator } from "@deltic/runtime/shim";
export * from "@deltic/ct-runner";
export { wasiShims } from "@deltic/wasi-shims";
export type { WasiShims, WasiShimsOptions } from "@deltic/wasi-shims";
