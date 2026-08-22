// The polyengine-browser worker's bundle entry for the engine surface:
// upstream's tools/release-bundle/entry.ts public surface, reproduced
// locally now that polyengine publishes JSR prereleases instead of a
// pinned raw-URL release bundle (see ../../../README.md's polyengine pin
// story and js/polyengine/deno.json's MODULE-IDENTITY comment).
//
// Bundled with `deno bundle --platform browser` from THIS directory (so
// every re-export resolves through this directory's deno.json import
// map — the single polyengine pin site), the emitted module is what
// browser/worker-entry.ts imports as `@polyengine/release-bundle-entry`
// used to. Same export surface: instantiate/Translator/runSuite/
// wasi/ComponentException/artifactsFromEnvelope and friends (49 exports
// verified against the retired upstream entry).
export * from "@polyengine/runtime/embedder";
export { Translator } from "@polyengine/runtime/shim";
export * from "@polyengine/ct-runner";
export { wasi } from "@polyengine/wasi";
export type { WasiImports, WasiOptions } from "@polyengine/wasi";
