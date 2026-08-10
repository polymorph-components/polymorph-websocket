// The smoke entry's embedder (`just wpt::smoke`): instantiate the
// componentized smoke component under the SAME deltic carrier the
// round-trip leg uses (it exports the same world) against the suite echo
// server, and require the streamed marker back. No transpile step, no
// engine flag — a fast bisector for componentize-js or deltic-pin bumps.
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { spawnEchod } from "../../../../conformance/server/echod.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
// Must agree with conformance/driver-ct/deltic/fetch-translator.ts's TAG
// (the single pin site), as roundtrip.mjs does.
const TAG = "pre-58b2404";

const loadBytes = async (path) => new Uint8Array(await readFile(join(REPO_ROOT, path)));

const { setSink, instantiateRunner } = await import(
  pathToFileURL(join(HERE, "build", "deltic-carrier.mjs")).href
);
setSink((record) => console.error("[smoke]", JSON.parse(record).name));

const [translatorBytes, componentBytes] = await Promise.all([
  loadBytes(`target/deltic/${TAG}/deltic-translator-shim.wasm`),
  loadBytes("js/componentize/wpt/build/smoke.component.wasm"),
]);
const runner = await instantiateRunner(translatorBytes, componentBytes);

const echod = await spawnEchod(join(REPO_ROOT, "target", "debug", "conformance-echod"));
let output;
try {
  output = await runner.run(echod.base);
} finally {
  await echod.shutdown();
}
if (typeof output !== "string" || !output.startsWith("WPT-PARITY-STREAMED ")) {
  console.error(`smoke returned an unexpected shape: ${String(output)}`);
  process.exit(1);
}
console.error(`smoke ok: ${output}`);
