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

# The one-version-everywhere gate: every `jsr:@deltic/*` package resolved
# in BOTH deno.locks (js/deltic and conformance/driver-ct/deltic) must
# agree on the exact same resolved version, or the embedder module can
# load twice across the module boundary (see js/deltic/deno.json's
# MODULE-IDENTITY comment). js/deltic's manifest takes a caret range
# (required for publishing to JSR) so the *lock*, not the manifest, is
# the source of truth for the resolved version. @deltic/protocol is
# excluded: it versions independently of the runtime/wasi/translator
# family it's a transitive dependency of.
exam-deltic:
    #!/usr/bin/env bash
    set -euo pipefail
    v=$(jq -r '.specifiers // {} | to_entries[] | select(.key | test("^jsr:@deltic/(?!protocol)")) | .value' \
        js/deltic/deno.lock conformance/driver-ct/deltic/deno.lock | sort -u)
    if [ "$(printf '%s\n' "$v" | wc -l)" != 1 ]; then
        echo "deltic pin drift: $v" >&2
        exit 1
    fi
    echo "deltic pin: $v"

# The JS runner core's one-version gate: the deltic-browser driver's
# npm tree (@jsr/polymorph__test, JSR's npm-compat form of
# jsr:@polymorph/test, routed through the tree's own .npmrc) and its
# deno.lock (which locks the same package under its bare jsr: name for
# the bundled worker import) must resolve the same version — a skewed
# bump runs the JS harness against a Rust runner from a different
# polymorph-test release. Wired next to exam-deltic in CI.
runner-js-pin-check:
    #!/usr/bin/env bash
    set -euo pipefail
    v=$({ grep -A1 "'@jsr/polymorph__test':" \
            conformance/driver-ct/deltic/pnpm-lock.yaml \
        | sed -n "s/.*specifier: *//p"; \
        jq -r '.jsr | keys[]' conformance/driver-ct/deltic/deno.lock \
        | grep '^@polymorph/test@' | sed 's/.*@//'; } | sort -u)
    if [ -z "$v" ] || [ "$(printf '%s\n' "$v" | wc -l)" != 1 ]; then
        echo "runner-js pin drift: $v" >&2
        exit 1
    fi
    echo "runner-js pin OK: @jsr/polymorph__test $v"
