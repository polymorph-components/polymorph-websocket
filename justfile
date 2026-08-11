# The orchestration surface: repo-wide recipes plus one module per software
# component, each module's justfile colocated with its code.

import 'justfile.shared.just'

mod gha '.github'
mod conformance-ct 'conformance/driver-ct'
mod demo 'examples'
mod wpt 'js/componentize/wpt'

default:
    @just --list

# The exact set of checks CI runs: each CI job runs exactly one gha:: job
# recipe.
ci: (gha::rust-checks) (gha::conformance-checks)

# Fast pre-commit checks.
check: fmt-check clippy validate-wit check-js test

fmt-check:
    cargo fmt --all -- --check

# Native crates (the workspace default-members) on the host target, then
# each wasm-only crate on its wasm target.
clippy:
    cargo clippy -- -D warnings
    cargo clippy --target wasm32-wasip2 -p websocket-guest-provider -- -D warnings
    cargo clippy --target wasm32-unknown-unknown -p echo-demo -- -D warnings
    cargo clippy --target wasm32-wasip2 -p conformance-guest-ct -- -D warnings

# Validate every WIT tree: the shared package and each consumer's world
# (which pulls the package in through its deps symlink).
validate-wit:
    wasm-tools component wit wit >/dev/null
    wasm-tools component wit rust/wasmtime/wit >/dev/null
    wasm-tools component wit conformance/wit >/dev/null
    wasm-tools component wit rust/guest-provider/wit >/dev/null
    wasm-tools component wit examples/echo-demo/wit >/dev/null
    @echo "wit: ok"

# Syntax-check the JavaScript trees; nothing else compiles them before a
# full conformance run would.
check-js:
    node --check js/componentize/websocket.js
    node --check js/componentize/wpt/harness.js
    node --check js/componentize/wpt/wpt-env.js
    node --check js/componentize/wpt/runner.js
    node --check js/componentize/wpt/smoke.js
    node --check js/componentize/wpt/reporter.js
    node --check js/componentize/wpt/parity/sockets-stub-deltic.mjs
    node --check js/componentize/wpt/parity/legs.mjs
    node --check js/componentize/wpt/parity/baseline.mjs
    node --check js/componentize/wpt/parity/roundtrip.mjs
    node --check js/componentize/wpt/parity/run-browser.mjs
    node --check js/componentize/wpt/parity/run-legs.mjs
    node --check js/componentize/wpt/parity/smoke-run.mjs
    node --check js/componentize/wpt/parity/compare.mjs
    node --check conformance/driver-ct/deltic/run-browser.mjs
    node --check conformance/server/echod.mjs
    @echo "js: ok"

# Native tests (the workspace default-members).
test:
    cargo test

# js/deltic's own unit-test gate (type-check + tests); the conformance
# leg itself is `conformance-ct::run-deltic`.
deltic-module-check:
    cd js/deltic && deno task check && deno task test

# The one-version-everywhere gate: every `jsr:@deltic/*` import across
# BOTH deno.json files that carry deltic imports must agree on the exact
# same pinned version (the retired release-asset pin gate, generalized to
# every package, not just the runtime/embedder URL).
exam-deltic:
    #!/usr/bin/env bash
    set -euo pipefail
    v=$(grep -ho 'jsr:@deltic/[a-z-]*@[^/"]*' js/deltic/deno.json conformance/driver-ct/deltic/deno.json \
        | sed 's/.*@//' | sort -u)
    if [ "$(printf '%s\n' "$v" | wc -l)" != 1 ]; then
        echo "deltic pin drift: $v" >&2
        exit 1
    fi
    echo "deltic pin: $v"
