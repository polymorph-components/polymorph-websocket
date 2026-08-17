// Deno runner for the echo-demo component: the guest is **runtime-linked**
// under deltic against this repo's deltic host module
// (js/deltic/websocket.ts over Deno's native `WebSocket`) and driven
// against a spawned suite echo server. No transpile step, no generated
// tree, no engine flag — the WIT contract's async exports run on the
// callback ABI.
//
// This replaces the retired jco demo (examples/jco-demo/run.mjs, removed
// with the jco legs; see git history), which transpiled the same
// component and drove the same `demo.run(url, count)` export.
//
//   just demo::deltic [count]
//   … run.ts [--translator <shim.wasm>] [count]
//
// The deltic pin is SINGLE-SITE: this runner resolves `@deltic/*` through
// conformance/driver-ct/deltic/deno.json. The translator comes from the
// packaged `@deltic/translator` JSR prerelease by default (no fetch
// step); `--translator <path>` remains as an optional override for a
// locally-built translator shim. The same import map keeps one embedder
// instance — one runtime/translator plan-format pairing — in the graph
// (see that deno.json's MODULE-IDENTITY note).

import { Translator } from "@deltic/runtime/shim";
import type { ComponentArtifacts } from "@deltic/runtime/embedder";
import { instantiate, isWitError } from "@deltic/runtime/embedder";
import { defaultTranslator } from "@deltic/translator";
import { wasiShims } from "@deltic/wasi-shims";
import { websocketImports } from "../../js/deltic/websocket.ts";

// This file sits at examples/deltic-demo/run.ts, so the repo root is two
// levels up.
const ROOT = new URL("../../", import.meta.url);
const ECHOD_BIN = new URL("target/debug/conformance-echod", ROOT).pathname;
const DEMO_WASM = new URL("target/components/echo-demo.wasm", ROOT).pathname;

/** The demo world's single export (`export demo;` in
 *  examples/echo-demo/wit): exports are keyed by verbatim WIT id
 *  (contracts/embedder-api.md §"Module wiring and instantiation"), and
 *  the demo package carries no version. */
const DEMO_INTERFACE = "demo:websocket-echo/demo";

interface Cli {
  count: number;
  translator?: string;
}

function parseArgs(argv: string[]): Cli {
  const cli: Cli = { count: 100 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--translator") {
      cli.translator = argv[++i];
    } else {
      const n = Number(argv[i]);
      if (!Number.isFinite(n)) throw new Error(`unknown argument ${argv[i]}`);
      cli.count = n;
    }
  }
  return cli;
}

/** `spawnEchod` (conformance/server/echod.mjs), ported to Deno exactly as
 *  conformance/driver-ct/deltic/run.ts ports it: start the binary and
 *  scrape its one `LISTENING <ws> <wss>` line. */
async function spawnEchod(): Promise<{ base: string; shutdown: () => void }> {
  const child = new Deno.Command(ECHOD_BIN, {
    stdout: "piped",
    stderr: "inherit",
  }).spawn();
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = setTimeout(() => {
    throw new Error("echo server did not report a URL in time");
  }, 10_000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("echo server exited before reporting a URL");
      buffer += decoder.decode(value, { stream: true });
      const m = /LISTENING (ws:\/\/\S+) (wss:\/\/\S+)/.exec(buffer);
      if (m) {
        return {
          base: m[1].trim(),
          shutdown: () => {
            try {
              child.kill("SIGTERM");
            } catch { /* already gone */ }
            reader.cancel().catch(() => {});
          },
        };
      }
    }
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
  }
}

async function loadArtifacts(translatorPath?: string): Promise<ComponentArtifacts> {
  const translator = translatorPath
    ? await Translator.create(await Deno.readFile(translatorPath))
    : await defaultTranslator();
  const componentBytes = await Deno.readFile(DEMO_WASM);
  const { plan, adapters } = translator.translate(componentBytes);
  return { plan, componentBytes, adapters };
}

async function main() {
  const cli = parseArgs(Deno.args);

  const artifacts = await loadArtifacts(cli.translator);
  const echod = await spawnEchod();
  console.error(`echo server ready at ${echod.base}`);
  try {
    const instance = await instantiate(artifacts, {
      ...wasiShims(),
      ...websocketImports(),
    });
    const demo = instance.exports[DEMO_INTERFACE] as {
      run(url: string, count: number): Promise<number>;
    };
    // The export's `result<u32, string>` lifts to return-or-throw in
    // return position (contracts/embedder-api.md §"Value mapping"): the
    // err payload rides a branded `WitError`.
    try {
      const received = await demo.run(`${echod.base}/echo`, cli.count);
      console.log(`round-tripped ${received}/${cli.count} messages`);
    } catch (err) {
      const detail = isWitError(err) ? err.payload : err;
      console.error(`demo failed: ${detail}`);
      Deno.exitCode = 1;
    }
  } finally {
    echod.shutdown();
  }
}

if (import.meta.main) await main();
