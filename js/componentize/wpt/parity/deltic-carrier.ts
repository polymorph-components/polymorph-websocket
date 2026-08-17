// The WPT parity round trip's carrier: everything between the parity
// runner component and the platform's own `WebSocket`, bundled into ONE
// module (`build/deltic-carrier.mjs`) that both engine drivers load —
// Node (roundtrip.mjs, smoke-run.mjs) and the browser page
// (run-browser.mjs).
//
// It replaces the jco-era carrier (a `jco transpile` generated tree plus
// `js/jco/websocket.js`, retired with the jco legs; see git history) with
// deltic's runtime linking: no transpile step, no generated tree, no
// engine flag. componentize-js — the *guest* toolchain that builds the
// runner component — is untouched.
//
// MODULE-IDENTITY TRAP (the same rationale as
// conformance/driver-ct/deltic/browser/worker-entry.ts's header, one
// level up the stack): after bundling, this module's copy of
// `../reporter.js` is a DISTINCT instance from any other import of that
// file. The runner's `wpt:parity/reporter@0.1.0` import and the `setSink`
// a leg installs must be the same instance, so both come from here —
// legs.mjs must not import `../reporter.js` itself.
//
// THE DELTIC PIN IS SINGLE-SITE: this module resolves `@deltic/*` through
// conformance/driver-ct/deltic/deno.json (exact-pinned JSR prereleases;
// the bundle recipe runs `deno bundle` from that directory) and the
// translator asset is extracted from the packaged `@deltic/translator`
// JSR package's lock-pinned module cache (no fetch step). Bundling from
// there also keeps `@deltic/runtime/embedder` a single module instance
// across this bundle and js/deltic/websocket.ts — one runtime/translator
// plan-format pairing (value recognition is brand-based and would
// survive a multi-copy bundle; the pairing would not).

import { Translator } from "@deltic/runtime/shim";
import { instantiate } from "@deltic/runtime/embedder";
import { wasiShims } from "@deltic/wasi-shims";
import { websocketImports } from "../../../deltic/websocket.ts";
import { reporter, setSink } from "../reporter.js";
import { socketsStubs } from "./sockets-stub-deltic.mjs";

/** The bundled reporter instance — see the MODULE-IDENTITY note above. */
export { setSink };

/** The runner world's single export (`export runner;` in wit/world.wit):
 *  exports are keyed by verbatim versioned WIT id
 *  (contracts/embedder-api.md §"Module wiring and instantiation"). */
const RUNNER_INTERFACE = "wpt:parity/runner@0.1.0";

/**
 * Translate and instantiate the parity runner component under deltic,
 * wired to this repo's JS host module, and return its exported `runner`
 * facade (`run(serverUrl)`).
 *
 * Callback ABI: no `jspi` option is passed, so no engine flag is needed
 * anywhere.
 *
 * @param translatorBytes the pinned deltic translator shim
 * @param componentBytes  build/parity-runner.component.wasm
 */
export async function instantiateRunner(
  translatorBytes: Uint8Array,
  componentBytes: Uint8Array,
): Promise<{ run(serverUrl: string): Promise<string> }> {
  const translator = await Translator.create(translatorBytes);
  const { plan, adapters } = translator.translate(componentBytes);
  const instance = await instantiate({ plan, componentBytes, adapters }, {
    ...wasiShims(),
    ...socketsStubs(),
    // The host module under test: the same import-record assembly the
    // conformance leg uses (conformance/driver-ct/deltic/run.ts).
    ...websocketImports(),
    "wpt:parity/reporter@0.1.0": reporter,
  });
  return instance.exports[RUNNER_INTERFACE];
}
