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
JSR as a lockstep-versioned line (this directory exact-pins `0.5.0`) and
`@polyengine/protocol` (the host-ABI vocabulary package) as an
independently-versioned line (exact-pinned `0.2.2` here). It is pinned in
this directory's `deno.json` import map
(`jsr:@polyengine/<pkg>@0.5.0` for `@polyengine/ct-runner`,
`@polyengine/runtime/embedder`, `@polyengine/runtime/shim`,
`@polyengine/wasi`, `@polyengine/translator`; `jsr:@polyengine/protocol@0.2.2`
for vocabulary consumed by driver code such as `examples/polyengine-demo/run.ts`).
`deno.lock` carries integrity hashes for that module graph, enforced with
`--frozen`.

As of the A22 protocol/runtime split, `@polymorph/websocket`
([`../../../js/polyengine/deno.json`](../../../js/polyengine/deno.json))
depends on `@polyengine/protocol` only — it resolves no
`@polyengine/runtime` at all, so its copy of `@polyengine/protocol` need
not match this directory's (the host module's brand-based value
recognition is harmless across copies by construction). This directory's
own runtime-family pins still need to be internally consistent: if this
repo ever loads the embedder from more than one config, stateful handles
(streams/futures) minted by one copy are refused by another.

`@polyengine/translator` ships the translator wasm asset **for the same
commit** as `@polyengine/runtime`, so the plan-format coupling is
self-consistent per graph by construction — there is no separate sha256
to track. The root justfile's `exam-polyengine` recipe (wired into CI) is
the pin gate: it asserts one resolved `@polyengine/runtime`-family
version and one resolved `@polyengine/protocol` version across both
`deno.lock` files, plus a cheap guard that `js/polyengine` (the published
host module) names no `@polyengine/runtime` specifier at all.

Both `deno.json`s carry
`"minimumDependencyAge": { "age": "P1D", "exclude": ["jsr:@polyengine/*"] }`
(verbatim from polyengine's README): Deno's 24-hour supply-chain gate would
otherwise block resolving a same-day publish.

To bump: update the version in this directory's `deno.json` import map
(and `js/polyengine/deno.json`'s `@polyengine/protocol` caret range, if
bumping that independently-versioned line), delete **both** `deno.lock`
files (this directory and `js/polyengine/`), regenerate with
`deno install` (or `deno check`) in each directory, then re-run
`just conformance-ct::run-polyengine` and commit the diff (including the
regenerated `matrix.md`, via `just conformance-ct::matrix-update`).
`exam-polyengine` fails loud on any drift.
