# `conformance/driver-ct/deltic` — the deltic-native conformance leg

The `deltic-deno` target in the conformance matrix: the suite runs
runtime-linked under stock Deno — no transpile step, no generated tree,
no engine flag (the WIT contract's async exports run on the callback ABI)
— against [`js/deltic/websocket.ts`](../../../js/deltic/websocket.ts).
This is the deltic analogue of the retired jco Node leg (removed with the
jco legs; see git history); see `run.ts`'s header for the
exact mirror.

## Running it

```sh
just conformance-ct::run-deltic
```

which builds the suite + echod and runs the suite through `ct-runner`,
writing `conformance/driver-ct/results/deltic-deno.jsonl`. The translator
comes from the packaged `@deltic/translator` JSR prerelease through the
module graph — no fetch step, no net grant.

## The pin

deltic publishes `@deltic/{runtime,translator,wasi-shims,ct-runner}` to
JSR as exact-pinned prereleases (`0.1.0-pre.g<shorthash>`, the same short
hash as the corresponding GitHub release — a version names one exact
upstream commit; see deltic's README "Consuming the unstable
prereleases"). It is pinned in **two** places, both required to agree:

- `deno.json` (this directory) — import-map versions
  (`jsr:@deltic/<pkg>@0.1.0-pre.g<hash>`) for `@deltic/ct-runner`,
  `@deltic/runtime/embedder`, `@deltic/runtime/shim`, `@deltic/wasi-shims`,
  `@deltic/translator`. `deno.lock` carries integrity hashes for that
  module graph, enforced with `--frozen`.
- [`../../../js/deltic/deno.json`](../../../js/deltic/deno.json) — the
  SAME `@deltic/runtime` version (the module-identity constraint: deltic's
  `wasi-shims` imports `@deltic/runtime/embedder` by bare specifier
  internally, so every config resolving it must agree, or the embedder
  module loads twice and `instanceof WitError` stops holding across the
  boundary).

`@deltic/translator` ships the translator wasm asset **for the same
commit** as `@deltic/runtime`, so the plan-format coupling is
self-consistent per graph by construction — there is no separate sha256
to track. The root justfile's `exam-deltic` recipe (wired into CI) is the
one-version-everywhere gate: it asserts every `jsr:@deltic/*` import
across both `deno.json` files names the identical version.

Both `deno.json`s carry
`"minimumDependencyAge": { "age": "P1D", "exclude": ["jsr:@deltic/*"] }`
(verbatim from deltic's README): Deno's 24-hour supply-chain gate would
otherwise block resolving a same-day publish.

To bump: update the version in both `deno.json` import maps, delete
**both** `deno.lock` files (this directory and `js/deltic/`), regenerate
with `deno install` (or `deno check`) in each directory, then re-run
`just conformance-ct::run-deltic` and commit the diff (including the
regenerated `matrix.md`, via `just conformance-ct::matrix-update`).
`exam-deltic` fails loud on any drift between the two configs.
