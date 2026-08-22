#!/usr/bin/env python3
"""Extract the polyengine translator wasm from a `deno info --json` graph.

Used by justfile.shared.just's extract-polyengine-translator recipe:
every browser leg that used to fetch a sha256-pinned GitHub release
asset now copies the translator wasm straight out of the
`@polyengine/translator` JSR package's lock-pinned module cache instead
(no network, no sha bookkeeping — the package's integrity lives in
conformance/driver-ct/polyengine/deno.lock, enforced by --frozen).

Usage: extract-polyengine-translator.py <deno-info.json> <out_dir> <expected-pin>
"""
import json
import sys


def main() -> None:
    info_path, out_dir, pin = sys.argv[1], sys.argv[2], sys.argv[3]
    graph = json.load(open(info_path))
    mods = [m for m in graph["modules"] if "/@polyengine/" in m.get("specifier", "")]
    bad = {m["specifier"] for m in mods if pin not in m["specifier"]}
    if bad:
        sys.exit(f"pin drift in translator graph (expected {pin}): {bad}")
    asset = next(m for m in mods if m["specifier"].endswith("/translator_shim.wasm"))
    # Deno's on-disk remote cache appends a `// denoCacheMetadata={...}`
    # trailer after the module body (observed empirically: the cached
    # file is larger than the graph's reported `size`, and the trailer is
    # plain text appended after the wasm bytes) — truncate to the
    # authoritative size the graph reports before copying, or the
    # trailer corrupts the wasm module (`WebAssembly.compile` fails with
    # "unexpected section" near EOF).
    with open(asset["local"], "rb") as f:
        data = f.read(asset["size"])
    with open(out_dir + "/polyengine-translator-shim.wasm", "wb") as f:
        f.write(data)


if __name__ == "__main__":
    main()
