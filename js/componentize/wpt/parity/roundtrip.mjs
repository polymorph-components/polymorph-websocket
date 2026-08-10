// The round-trip leg's Node driver: spawn the suite echo server, run the
// shared leg body (legs.mjs) through the deltic carrier bundle
// (build/deltic-carrier.mjs — see deltic-carrier.ts), and emit the
// records as JSON on stdout, matching baseline.mjs.
//
// No transpile step and no engine flag: deltic runtime-links the runner
// component on the callback ABI.

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { spawnEchod } from "../../../../conformance/server/echod.mjs";
import { runRoundtrip } from "./legs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");

// Must agree with conformance/driver-ct/deltic/fetch-translator.ts's TAG
// (the single pin site; the asset is served out of its cache directory),
// exactly as conformance/driver-ct/deltic/run-browser.mjs pins it.
const TAG = "pre-58b2404";

const carrier = {
  url: pathToFileURL(join(HERE, "build", "deltic-carrier.mjs")).href,
  translatorPath: `target/deltic/${TAG}/deltic-translator-shim.wasm`,
  componentPath: "js/componentize/wpt/build/parity-runner.component.wasm",
  async loadBytes(path) {
    return new Uint8Array(await readFile(join(REPO_ROOT, path)));
  },
};

const echod = await spawnEchod(join(REPO_ROOT, "target", "debug", "conformance-echod"));
let records;
try {
  records = await runRoundtrip(echod.base, carrier);
} finally {
  await echod.shutdown();
}
process.stdout.write(JSON.stringify(records));
