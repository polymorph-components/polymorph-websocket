// The polyengine-browser shard worker's bundle entry: the polyengine
// engine surface (the local browser-bundle-entry.ts, re-exporting the
// pinned JSR packages' public surface), the upstream worker message
// loop, and this repo's polyengine host module, resolved through ONE
// import map so the emitted bundle carries exactly one embedder module
// instance — one runtime/translator plan-format pairing, one copy on
// the runtime's copy census (workers resolve no import maps, so
// bundling is the only sound shape; see @jsr/polymorph__test's
// runner-polyengine README).
//
// Built by `just conformance-ct::run-polyengine-browser` with
// `deno bundle --platform browser` into target/polyengine-browser/, and
// served to the page from there as runSuitesInPage's workerUrl.

import * as polyengine from "../browser-bundle-entry.ts";
import { workerMain } from "@polymorph/test/polyengine-worker-main";
import { configure, websocketImports } from "../../../../js/polyengine/websocket.ts";

// The suite bounds, matching every other leg (run-node.mjs, run.ts, the
// wasmtime driver): one behavioral floor across targets. Connections
// capture them at connect, so configuring the module once per run
// message covers every instance.
const MAX_INBOUND_BUFFER_BYTES = 256 * 1024;
const CONNECT_TIMEOUT_MS = 5000;
const CLOSE_TIMEOUT_MS = 3000;

workerMain({
  polyengine,
  suiteImports: () => {
    configure({
      maxInboundBufferBytes: MAX_INBOUND_BUFFER_BYTES,
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
      closeTimeoutMs: CLOSE_TIMEOUT_MS,
    });
    return websocketImports();
  },
});
