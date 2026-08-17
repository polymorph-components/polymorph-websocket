// The repo's own deltic leg of the component-test conformance harness:
// this repo's flagship gate is `just conformance-ct` running EVERY target
// (wasmtime, composed, deltic-deno, deltic-browser) against the shared
// suite; this is the deltic-native Deno target. It began as the deltic
// analogue of the jco Node leg (`conformance/driver-ct/jco/run-node.mjs`,
// retired with the jco legs; see git history), mirroring it exactly:
//
//   the retired run-node.mjs                  | this runner
//   ------------------------------------------+---------------------------
//   `connections.setMaxInboundBufferBytes(…)`  | `configure({ … })`, same values
//   `spawnEchod(bin)` scraping LISTENING       | `spawnEchod()`, same scrape
//   `unreachableUrl()` (bind port 0, release)  | same
//   `env = [[WS_CONFORMANCE_*, …]]`            | `wasi({ cli: { env } })`
//   `runSuite(...)` (component-test-js)        | `runSuite(...)` (ct-runner)
//   `NODE_EXTRA_CA_CERTS=…/tls/ca.pem`         | `DENO_CERT=…/tls/ca.pem`
//
// deltic is a runtime linker: there is no transpile step, no generated
// tree, and no engine flag — the WIT contract's async
// exports run on the callback ABI under stock Deno.
//
//   just conformance-ct::run-deltic          # the full leg
//   … run.ts [--translator <shim.wasm>] [--only SUBSTRING] [--jspi]
//
// `DENO_CERT` must name the suite's committed test CA so the three
// `websocket/tls/*` cases can complete their handshake; the
// `conformance-ct::run-deltic` justfile recipe supplies it. NO cases are
// excluded: the TLS leg runs headlessly under Deno exactly as the ws:
// leg does.
//
// MODULE-IDENTITY CONSTRAINT: deltic's wasi module imports
// `@deltic/runtime/embedder` by bare specifier internally; this leg's
// `deno.json` AND `js/deltic/deno.json` must map that specifier to the
// IDENTICAL exact-pinned JSR version, or the embedder module loads twice
// and the graph carries two runtime/translator plan-format pairings (the
// host module's value recognition is brand-based and survives that).
//
// The translator comes from the packaged `@deltic/translator` JSR
// prerelease (defaultTranslator()) by default — no fetch step, no
// sha256 bookkeeping, no net grant; `--translator <path>` remains as an
// optional override for a locally-built translator shim.
//
// The suite artifact is the BARE suite — websocket still imported — so
// the run actually exercises the host module; the sibling `composed/`
// artifact has the provider plugged in-guest and would exercise no host
// module at all.

import { Translator } from "@deltic/runtime/shim";
import type { ComponentArtifacts } from "@deltic/runtime/embedder";
import { defaultTranslator } from "@deltic/translator";
import { runSuite } from "@deltic/ct-runner";
import { wasi } from "@deltic/wasi";
import { configure, websocketImports } from "../../../js/deltic/websocket.ts";

// This file sits at conformance/driver-ct/deltic/run.ts, so the repo
// root is three levels up.
const ROOT = new URL("../../../", import.meta.url);
const ECHOD_BIN = new URL("target/debug/conformance-echod", ROOT).pathname;
/** The suite artifact: the BARE suite (see header). */
const SUITE_WASM = new URL(
  "target/wasm32-wasip2/release/conformance_guest_ct.wasm",
  ROOT,
).pathname;
const CA_PEM = new URL("conformance/server/tls/ca.pem", ROOT).pathname;

// The suite bounds, matching run-node.mjs and the wasmtime driver — that
// is the point: one behavioral floor, five targets. Connections capture
// them at connect, so configuring the module once covers every case.
const MAX_INBOUND_BUFFER_BYTES = 256 * 1024;
const CONNECT_TIMEOUT_MS = 5000;
const CLOSE_TIMEOUT_MS = 3000;

/** harness.mjs's per-case wall bound. */
const CASE_TIMEOUT_MS = 60_000;

interface Cli {
  only?: string;
  jspi: boolean;
  out: string;
  target: string;
  translator?: string;
}

function parseArgs(argv: string[]): Cli {
  const cli: Cli = {
    jspi: false,
    out: new URL("conformance/driver-ct/results/deltic-deno.jsonl", ROOT).pathname,
    target: "deltic-deno",
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--only":
        cli.only = argv[++i];
        break;
      case "--jspi":
        cli.jspi = true;
        break;
      case "--out":
        cli.out = argv[++i];
        break;
      case "--target":
        cli.target = argv[++i];
        break;
      case "--translator":
        cli.translator = argv[++i];
        break;
      default:
        throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return cli;
}

/** `spawnEchod` (conformance/server/echod.mjs), ported: start the binary
 *  and scrape its one `LISTENING <ws> <wss>` line. */
async function spawnEchod(): Promise<{
  base: string;
  tlsBase: string;
  shutdown: () => void;
}> {
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
          tlsBase: m[2].trim(),
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

/** `unreachableUrl` (echod.mjs), ported: a loopback `ws:` URL whose
 *  connect attempt should be refused — a port just bound and released. */
function unreachableUrl(): string {
  const l = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const { port } = l.addr as Deno.NetAddr;
  l.close();
  return `ws://127.0.0.1:${port}/echo`;
}

/** The echod binary is a build artifact this driver does not produce
 *  itself (unlike deltic's own port, which is inside a checkout that
 *  owns the cargo build): `just conformance-ct::build-echod` owns it. */
async function ensureEchod(): Promise<void> {
  try {
    const st = await Deno.stat(ECHOD_BIN);
    if (st.isFile) return;
  } catch {
    // fall through to the shared error
  }
  throw new Error(
    `conformance-echod binary not found at ${ECHOD_BIN}; run ` +
      `\`just conformance-ct::build-echod\` first.`,
  );
}

async function loadArtifacts(translatorPath?: string): Promise<ComponentArtifacts> {
  const translator = translatorPath
    ? await Translator.create(await Deno.readFile(translatorPath))
    : await defaultTranslator();
  const componentBytes = await Deno.readFile(SUITE_WASM);
  const { plan, adapters } = translator.translate(componentBytes);
  return { plan, componentBytes, adapters };
}

async function main() {
  const cli = parseArgs(Deno.args);

  if (Deno.env.get("DENO_CERT") === undefined) {
    console.error(
      `warning: DENO_CERT is unset — the suite's committed test PKI is not ` +
        `trusted, so the three websocket/tls/* cases will fail their ` +
        `connect. Re-run with DENO_CERT=${CA_PEM} (the Deno analogue of ` +
        `run-node.mjs's NODE_EXTRA_CA_CERTS; see the ` +
        `conformance-ct::run-deltic justfile recipe).`,
    );
  }

  configure({
    maxInboundBufferBytes: MAX_INBOUND_BUFFER_BYTES,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    closeTimeoutMs: CLOSE_TIMEOUT_MS,
  });

  await ensureEchod();
  const echod = await spawnEchod();
  console.error(`echo server ready at ${echod.base} (tls: ${echod.tlsBase})`);

  const env: Record<string, string> = {
    WS_CONFORMANCE_SERVER_URL: echod.base,
    WS_CONFORMANCE_TLS_SERVER_URL: echod.tlsBase,
    WS_CONFORMANCE_UNREACHABLE_URL: unreachableUrl(),
    WS_CONFORMANCE_MAX_INBOUND_BUFFER_BYTES: String(MAX_INBOUND_BUFFER_BYTES),
  };

  const artifacts = await loadArtifacts(cli.translator);
  const imports = {
    ...wasi({ cli: { env, passthrough: false } }),
    ...websocketImports(),
  };

  const lines: string[] = [];
  const started = performance.now();
  try {
    const counts = await runSuite(artifacts, {
      imports,
      target: cli.target,
      suiteName: "conformance_guest_ct",
      only: cli.only,
      caseTimeoutMs: CASE_TIMEOUT_MS,
      jspi: cli.jspi,
      emit: (line) => lines.push(line),
      log: (msg) => console.error(msg),
    });
    await Deno.writeTextFile(cli.out, lines.join("\n") + "\n");
    console.error(
      `\n${counts.passed} passed | ${counts.failed} failed | ${counts.skipped} skipped ` +
        `(${counts.total} total) in ${((performance.now() - started) / 1000).toFixed(1)}s ` +
        `-> ${cli.out}`,
    );
    if (counts.failed > 0) Deno.exitCode = 1;
  } finally {
    echod.shutdown();
  }
}

if (import.meta.main) await main();
