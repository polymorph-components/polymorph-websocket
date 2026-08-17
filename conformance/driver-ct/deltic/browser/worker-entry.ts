// The deltic-browser shard worker's bundle entry: the deltic engine
// surface (the local browser-bundle-entry.ts, re-exporting the pinned
// JSR packages' public surface), the upstream worker message loop, and
// this repo's deltic host module, resolved through ONE import map so the
// emitted bundle carries exactly one embedder module instance — which is
// what keeps `instanceof ComponentException` true when the host module throws
// across the component boundary (workers resolve no import maps, so
// bundling is the only sound shape; see @jsr/polymorph__test's
// runner-deltic README).
//
// Built by `just conformance-ct::run-deltic-browser` with
// `deno bundle --platform browser` into target/deltic-browser/, and
// served to the page from there as runSuitesInPage's workerUrl.

import * as deltic from "../browser-bundle-entry.ts";
import { workerMain } from "@polymorph/test/deltic-worker-main";
import { configure, websocketImports } from "../../../../js/deltic/websocket.ts";

// The suite bounds, matching every other leg (run-node.mjs, run.ts, the
// wasmtime driver): one behavioral floor across targets. Connections
// capture them at connect, so configuring the module once per run
// message covers every instance.
const MAX_INBOUND_BUFFER_BYTES = 256 * 1024;
const CONNECT_TIMEOUT_MS = 5000;
const CLOSE_TIMEOUT_MS = 3000;

workerMain({
  deltic,
  suiteImports: () => {
    configure({
      maxInboundBufferBytes: MAX_INBOUND_BUFFER_BYTES,
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
      closeTimeoutMs: CLOSE_TIMEOUT_MS,
    });
    return websocketImports();
  },
});
