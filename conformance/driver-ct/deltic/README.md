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

which builds the suite + echod, fetches (and caches) the pinned
translator-shim release asset, and runs the suite through `ct-runner`,
writing `conformance/driver-ct/results/deltic-deno.jsonl`.

## The pin

deltic is pinned to a release tag in **three** places, cross-checked at
run time by `fetch-translator.ts`:

- `deno.json` (this directory) — import-map URLs
  (`raw.githubusercontent.com/lann/deltic/<tag>/…`) for `@deltic/ct-runner`,
  `@deltic/runtime/embedder`, `@deltic/runtime/shim`, `@deltic/wasi-shims`.
  `deno.lock` carries integrity hashes for that module graph, enforced
  with `--frozen`.
- [`../../../js/deltic/deno.json`](../../../js/deltic/deno.json) — the
  SAME `@deltic/runtime/embedder` URL (the module-identity constraint:
  deltic's `wasi-shims` imports that specifier by bare name internally,
  so every config resolving it must agree, or the embedder module loads
  twice and `instanceof WitError` stops holding across the boundary).
- `fetch-translator.ts` — `TAG` + `TRANSLATOR_SHA256` for the
  `deltic-translator-shim.wasm` release asset (cached under
  `target/deltic/<tag>/`).

To bump: update the tag in all three files (this `deno.json`,
`js/deltic/deno.json`, and `fetch-translator.ts`) and the sha256 from the
release's `SHA256SUMS`, delete BOTH `deno.lock` files (this directory and
`js/deltic/`), re-run `deno cache run.ts fetch-translator.ts` here and
`deno cache websocket.ts tests/websocket_test.ts` in `js/deltic/` to
regenerate them, then re-run `just conformance-ct::run-deltic` and commit
the diff (including the regenerated `matrix.md`, via
`just conformance-ct::matrix-update`).
