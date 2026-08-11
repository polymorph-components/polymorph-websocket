# Shared definitions imported by the root justfile and every module
# justfile. Import semantics place these in each importer's namespace, and
# imported recipe bodies run with the importer's working directory — so
# every recipe here anchors its paths on {{root}} and every variable is
# cwd-independent.
#
# Everything here is [private]: these are building blocks, not entry
# points, so they stay out of every module's `just --list`.

root := `git rev-parse --show-toplevel`

# Build a wasm32-unknown-unknown crate and wrap it into a component at
# `{{root}}/target/components/<crate>.wasm` (cargo's module name is the
# crate name with dashes as underscores). The write goes through a temp
# file: `-o` truncates in place, so a direct write would expose an empty or
# partial component to a concurrent reader.
[private]
build-component crate:
    cargo build --release -p {{crate}} --target wasm32-unknown-unknown
    mkdir -p {{root}}/target/components
    wasm-tools component new \
        {{root}}/target/wasm32-unknown-unknown/release/{{replace(crate, "-", "_")}}.wasm \
        -o {{root}}/target/components/{{crate}}.wasm.tmp
    mv -f {{root}}/target/components/{{crate}}.wasm.tmp {{root}}/target/components/{{crate}}.wasm

# Extract the deltic translator wasm from the pinned `@deltic/translator`
# JSR package's lock-pinned module cache into `out_dir` — no network, no
# sha256 bookkeeping (the JSR package's integrity lives in
# conformance/driver-ct/deltic/deno.lock, enforced by --frozen). Every
# browser leg that used to fetch a sha-pinned release asset now runs this
# instead. Resolves against conformance/driver-ct/deltic's import map (the
# single deltic pin site); asserts every module in the translator's graph
# resolves to the one pinned version before copying.
[private]
extract-deltic-translator out_dir:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p {{out_dir}}
    info=$(mktemp)
    trap 'rm -f "$info"' EXIT
    deno info --json --config {{root}}/conformance/driver-ct/deltic/deno.json --frozen \
        @deltic/translator > "$info"
    pin=$(grep -o 'jsr:@deltic/runtime@[^/"]*' {{root}}/conformance/driver-ct/deltic/deno.json | head -1 | sed 's/.*@//')
    python3 "{{root}}/scripts/extract-deltic-translator.py" "$info" {{out_dir}} "$pin"
