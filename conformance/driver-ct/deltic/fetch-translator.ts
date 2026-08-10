// Fetch (and cache) pinned deltic release assets.
//
// deltic is a runtime linker: components are translated by a wasm build of
// its translator, shipped as a release asset so consumers need no Rust
// toolchain; the browser leg additionally loads `deltic-embedder.mjs`
// (embedder API + Translator + runner glue + wasi shims in one
// platform-neutral ES module). This script downloads the selected asset
// once into target/deltic/, verifies it against the pinned sha256, and
// prints the cached path on stdout (the `conformance-ct::run-deltic*`
// recipes capture it).
//
//   fetch-translator.ts [--asset translator|embedder]   (default: translator)
//
// THE PIN lives here (TAG + per-asset sha256) and in TWO import maps:
// this directory's deno.json AND ../../../js/deltic/deno.json (the
// module-identity constraint documented there requires the embedder URL
// to be byte-identical in both). `assertPinConsistency` checks both and
// fails loud if either drifts.
//
// Bumping: update TAG here and in BOTH deno.json files, update the
// shas from the release's SHA256SUMS, delete BOTH deno.lock
// files, and re-run `deno cache run.ts fetch-translator.ts` in this
// directory plus `deno cache websocket.ts tests/websocket_test.ts` in
// js/deltic to regenerate them (commit the diff).

const TAG = "pre-58b2404";
const ASSETS: Record<string, { file: string; sha256: string }> = {
  translator: {
    file: "deltic-translator-shim.wasm",
    sha256: "6d02b363785593595a789d083cda0aebb1de790726718ccf543198354fa3870c",
  },
  embedder: {
    file: "deltic-embedder.mjs",
    sha256: "3cf48c6a984864c3cd8b094f9d99669967858e37c4835ee50543e3d04dca44a6",
  },
};

const HERE = new URL(".", import.meta.url);
const REPO_ROOT = new URL("../../../", HERE);
const CACHE_DIR = new URL(`target/deltic/${TAG}/`, REPO_ROOT);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as BufferSource,
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The one-pin-everywhere gate: every raw.githubusercontent URL in BOTH
 * sibling import maps must reference TAG. */
async function assertPinConsistency(): Promise<void> {
  const configs = [
    new URL("deno.json", HERE),
    new URL("../../../js/deltic/deno.json", HERE),
  ];
  for (const configUrl of configs) {
    const denoJson = await Deno.readTextFile(configUrl);
    const urls = denoJson.match(/https:\/\/raw\.githubusercontent\.com[^"]+/g) ?? [];
    if (urls.length === 0) {
      throw new Error(`${configUrl.pathname}: no pinned deltic URLs found`);
    }
    for (const url of urls) {
      if (!url.includes(`/lann/deltic/${TAG}/`)) {
        throw new Error(
          `pin drift: ${configUrl.pathname} pins ${url}\n` +
            `but fetch-translator.ts pins ${TAG}`,
        );
      }
    }
  }
}

async function main() {
  await assertPinConsistency();

  const flag = Deno.args.indexOf("--asset");
  const name = flag === -1 ? "translator" : Deno.args[flag + 1];
  const asset = ASSETS[name];
  if (!asset) {
    throw new Error(
      `unknown asset ${JSON.stringify(name)}; expected one of: ${
        Object.keys(ASSETS).join(", ")
      }`,
    );
  }
  const cached = new URL(asset.file, CACHE_DIR);

  try {
    const bytes = await Deno.readFile(cached);
    if (await sha256Hex(bytes) === asset.sha256) {
      console.log(cached.pathname);
      return;
    }
    console.error(`cached ${asset.file} has a stale digest; re-fetching`);
  } catch {
    // not cached yet
  }

  const releaseUrl =
    `https://github.com/lann/deltic/releases/download/${TAG}/${asset.file}`;
  console.error(`fetching ${releaseUrl} …`);
  const resp = await fetch(releaseUrl);
  if (!resp.ok) {
    throw new Error(`GET ${releaseUrl}: ${resp.status} ${resp.statusText}`);
  }
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const got = await sha256Hex(bytes);
  if (got !== asset.sha256) {
    throw new Error(
      `sha256 mismatch for ${asset.file}@${TAG}:\n  want ${asset.sha256}\n  got  ${got}`,
    );
  }
  await Deno.mkdir(CACHE_DIR, { recursive: true });
  await Deno.writeFile(cached, bytes);
  console.log(cached.pathname);
}

await main();
