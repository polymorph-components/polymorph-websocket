# `conformance/driver-ct/polyengine` — the polyengine-native conformance leg

The `polyengine-deno` target in the conformance matrix: the suite runs
runtime-linked under stock Deno — no transpile step, no generated tree,
no engine flag (the WIT contract's async exports run on the callback ABI)
— against [`js/polyengine/websocket.ts`](../../../js/polyengine/websocket.ts).
This is the polyengine analogue of the retired jco Node leg (removed with the
jco legs; see git history); see `run.ts`'s header for the
exact mirror.

## Running it

```sh
just conformance-ct::run-polyengine
```

which builds the suite + echod and runs the suite through `ct-runner`,
writing `conformance/driver-ct/results/polyengine-deno.jsonl`. The translator
comes from the packaged `@polyengine/translator` JSR prerelease through the
module graph — no fetch step, no net grant.

## The pin

polyengine publishes `@polyengine/{runtime,translator,wasi,ct-runner}` to
JSR as exact-pinned prereleases (`0.3.0-pre.g<shorthash>`, the same short
hash as the corresponding GitHub release — a version names one exact
upstream commit; see polyengine's README "Consuming the unstable
prereleases"). It is pinned in **two** places, both required to agree:

- `deno.json` (this directory) — import-map versions
  (`jsr:@polyengine/<pkg>@0.3.0-pre.g<hash>`) for `@polyengine/ct-runner`,
  `@polyengine/runtime/embedder`, `@polyengine/runtime/shim`, `@polyengine/wasi`,
  `@polyengine/translator`. `deno.lock` carries integrity hashes for that
  module graph, enforced with `--frozen`.
- [`../../../js/polyengine/deno.json`](../../../js/polyengine/deno.json) — the
  SAME `@polyengine/runtime` version (the module-identity constraint: polyengine's
  `wasi` module imports `@polyengine/runtime/embedder` by bare specifier
  internally, so every config resolving it must agree, or the embedder
  module loads twice — the host module's brand-based value recognition
  survives that, but a second copy splits the runtime/translator
  plan-format pairing).

`@polyengine/translator` ships the translator wasm asset **for the same
commit** as `@polyengine/runtime`, so the plan-format coupling is
self-consistent per graph by construction — there is no separate sha256
to track. The root justfile's `exam-polyengine` recipe (wired into CI) is the
one-version-everywhere gate: it asserts every `jsr:@polyengine/*` import
across both `deno.json` files names the identical version.

Both `deno.json`s carry
`"minimumDependencyAge": { "age": "P1D", "exclude": ["jsr:@polyengine/*"] }`
(verbatim from polyengine's README): Deno's 24-hour supply-chain gate would
otherwise block resolving a same-day publish.

To bump: update the version in both `deno.json` import maps, delete
**both** `deno.lock` files (this directory and `js/polyengine/`), regenerate
with `deno install` (or `deno check`) in each directory, then re-run
`just conformance-ct::run-polyengine` and commit the diff (including the
regenerated `matrix.md`, via `just conformance-ct::matrix-update`).
`exam-polyengine` fails loud on any drift between the two configs.
