// The deltic-browser leg: the suite runtime-linked inside a real
// headless Chromium against this repo's deltic host module
// (js/deltic/websocket.ts over the browser's native WebSocket) — no
// transpile step, no generated tree. The page, worker pool, stall
// watchdog, and Chrome ladder live in the upstream browser driver; the
// worker is this repo's own bundle (browser/worker-entry.ts: the deltic
// engine + host module + upstream message loop in one module — see the
// entry's header for why one bundle is the sound shape). This file is
// the frame: the echo server, the environment, target configuration,
// and results writing — the browser sibling of ./run.ts (as the retired
// jco run-browser.mjs was of its run-node.mjs; see git history).
//
// The page is served from http://127.0.0.1:<port> and opens ws:
// connections to the echo server directly (WebSocket is CORS-exempt);
// --ignore-certificate-errors provisions trust for the committed test
// PKI so the three websocket/tls/* cases run (loopback-only browser).
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  buildHarnessPage,
  findChrome,
  runPageHarness,
} from "@jsr/polymorph__test/browser-driver";
import { writeResultsFile } from "@jsr/polymorph__test/node-runner";

import { spawnEchod, unreachableUrl } from "../../server/echod.mjs";

const DELTIC_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(DELTIC_DIR, "..", "..", "..");
const WORKER_URL = "/target/deltic-browser/websocket-worker.mjs";
const TRANSLATOR_URL = "/target/deltic-browser/deltic-translator-shim.wasm";
const MAX_INBOUND_BUFFER_BYTES = 256 * 1024;
const CASE_TIMEOUT_MS = 60_000;
const STALL_TIMEOUT_MS = 90_000;

const { values } = parseArgs({
  options: {
    out: {
      type: "string",
      default: join(REPO_ROOT, "conformance", "driver-ct", "results"),
    },
    target: { type: "string", default: "deltic-browser" },
    server: { type: "string" },
    "tls-server": { type: "string" },
    "echod-bin": {
      type: "string",
      default: join(REPO_ROOT, "target", "debug", "conformance-echod"),
    },
  },
});

async function main() {
  for (const [what, rel] of [
    ["bundled worker (run `just conformance-ct::run-deltic-browser`)", WORKER_URL],
    [`translator asset (run \`just conformance-ct::run-deltic-browser\`)`, TRANSLATOR_URL],
    ["suite component (run `just conformance-ct::build-suite`)", "/target/wasm32-wasip2/release/conformance_guest_ct.wasm"],
  ]) {
    try {
      await access(join(REPO_ROOT, rel));
    } catch {
      throw new Error(`missing ${rel}: ${what}`);
    }
  }

  const owned = values.server ? null : await spawnEchod(values["echod-bin"]);
  const serverUrl = values.server ?? owned.base;
  const tlsServerUrl = values["tls-server"] ?? owned?.tlsBase;
  if (!tlsServerUrl) {
    throw new Error("--server requires --tls-server (the suite echo server's wss: base URL)");
  }

  const config = {
    // Sequential: the corpus is loopback-I/O-bound, and one worker
    // sidesteps Chromium's per-endpoint handshake serialization.
    jobs: 1,
    workerUrl: WORKER_URL,
    suites: [
      {
        suite: "conformance-guest-ct",
        target: values.target,
        translatorUrl: TRANSLATOR_URL,
        suiteUrl: "/target/wasm32-wasip2/release/conformance_guest_ct.wasm",
        missing: [],
        caseTimeoutMs: CASE_TIMEOUT_MS,
        env: [
          ["WS_CONFORMANCE_SERVER_URL", serverUrl],
          ["WS_CONFORMANCE_TLS_SERVER_URL", tlsServerUrl],
          ["WS_CONFORMANCE_UNREACHABLE_URL", await unreachableUrl()],
          ["WS_CONFORMANCE_MAX_INBOUND_BUFFER_BYTES", String(MAX_INBOUND_BUFFER_BYTES)],
        ],
      },
    ],
  };

  const playwright = await import("playwright-core");
  let outcome;
  try {
    outcome = await runPageHarness({
      playwright,
      engine: "chromium",
      executablePath: await findChrome(),
      repoRoot: REPO_ROOT,
      html: buildHarnessPage({
        title: "polymorph:websocket conformance (deltic-browser)",
        config,
      }),
      stallTimeoutMs: STALL_TIMEOUT_MS,
      launchArgs: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors"],
    });
  } finally {
    if (owned) await owned.shutdown();
  }

  const run = outcome[values.target];
  if (!run) throw new Error(`the page reported no run for target ${values.target}`);
  const outPath = await writeResultsFile({
    dir: values.out,
    target: values.target,
    lines: run.lines,
  });
  const c = run.counts;
  process.stderr.write(
    `${values.target}: ${c.passed} passed, ${c.failed} failed, ${c.skipped} skipped, ` +
      `${c.na} not applicable, ${c.total} total (wrote ${outPath})\n`,
  );
  process.exit(c.failed === 0 && c.total > 0 ? 0 : 1);
}

main().then(
  () => {},
  (err) => {
    console.error(err);
    process.exit(2);
  },
);
