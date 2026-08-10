# AGENTS.md

Guidance for automated agents (and humans) working in this repository.

## What this repository is

`polymorph:websocket`: a WIT interface for WebSocket client connections plus
multiple implementations that run the *same* guest component against real
WebSocket stacks. It is a sibling of
[`polymorph:webcrypto`](https://github.com/polymorph-components/polymorph-webcrypto) and
[`polymorph:webrtc-datachannels`](https://github.com/polymorph-components/polymorph-webrtc-datachannels)
and deliberately mirrors their architecture — prefer clarity and
correctness over features, and keep the implementations behaviourally in
sync (the cross-implementation conformance suite is the gate). See
[`README.md`](README.md) for the design.

The repository follows the siblings' conventions: the root `justfile` is
the single entry point (`just check` for the fast gate, `just ci` for the
exact CI mirror) with component-scoped module justfiles; `scripts/setup.sh`
is the idempotent dependency setup CI reuses verbatim; conformance is
driven by a shared guest suite on the `polymorph:test` harness with
a per-target driver and `targets.toml` declaring target facts.

Layout (each directory's justfile module in parentheses):

- `wit/` — the one copy of the `polymorph:websocket` package; `wit/README.md`
  is the package contract document item docs reference by section name.
- `rust/wasmtime/` — the `wasmtime-websocket` host crate. Its knobs (the
  connect/close bounds, the inbound-buffer bound) live on
  `WasiWebsocketCtx`; the crate reads no ambient environment.
- `js/deltic/` (`just deltic-module-check`) — `websocket.ts`, THE
  browser-first JS host module, over
  [deltic](https://github.com/lann/deltic)'s embedder conventions (typed
  streams, `WitError`) for its runtime-linked, no-transpile legs
  (`conformance/driver-ct/deltic/`, the WPT parity round trip, the demo).
  Its knobs are exported functions (`configure`,
  `setMaxInboundBufferBytes`, `setConnectTimeoutMs`, `setCloseTimeoutMs`);
  the module reads no ambient configuration. The
  deltic release is pinned in `conformance/driver-ct/deltic/fetch-translator.ts`
  (TAG + translator-shim sha256) and in TWO import maps —
  `js/deltic/deno.json` and `conformance/driver-ct/deltic/deno.json` —
  which must agree byte-for-byte on the `@deltic/runtime/embedder` URL
  (deltic's `wasi-shims` imports it by bare specifier internally, so a
  drift would load the embedder module twice and break `instanceof
  WitError` across the boundary). Bump procedure:
  `conformance/driver-ct/deltic/README.md`.
- `js/componentize/` (`just wpt::…`) — `websocket.js`, the WHATWG-API
  shim for componentize-js guests (deviations registry in its header), and
  the WPT parity gate (`wpt/README.md` is the vendoring policy; losses
  ratchet in `wpt/parity/losses.js`).
- `conformance/` (`just conformance-ct`) — the conformance suite on the
  `polymorph:test` harness: `guest-ct/` (the suite component; the
  committed `tests.lock` is the corpus inventory),
  `driver-ct/` (wasmtime + composed + deltic-deno + deltic-browser legs,
  `targets.toml`
  with the expected-fail mechanism, the committed `matrix.md`), and
  `server/` (echod; `server/PROTOCOL.md` is its wire contract,
  `server/echod.mjs` the shared Node spawn helpers). The suite crates
  consume the harness as rev-pinned git dependencies (the two
  `[workspace.dependencies]` entries in the root `Cargo.toml`), the
  deltic-browser driver consumes its JS runner core as a git dep
  (`@polymorph/component-test-js` in `driver-ct/deltic/package.json`), and
  the `component-test` CLI is cargo-installed at the rev Cargo.lock
  records (`conformance-ct::_ct-tools`). One rev everywhere; the root
  `Cargo.toml` comment is the bump checklist. There is no transpiler
  dependency anywhere: the JS host legs are runtime-linked by the pinned
  deltic release assets (single pin site:
  `driver-ct/deltic/{deno.json,deno.lock,fetch-translator.ts}`).
- `examples/` (`just demo::…`) — the echo-demo guest and its host runners.

Checks to run before committing, by what changed: WIT or `wit/README.md` →
`just validate-wit` then `just conformance-ct` (a surface change is
co-dependent across every implementation); either implementation →
`just conformance-ct`; Rust → `just check`; conformance machinery →
`just conformance-ct`; justfiles/CI → `just ci`.

## Renaming WIT items

Changing any interface or resource identifier means updating everyone who
names it as a string; nothing catches these at build time except the
places listed failing at run time. The sites:

- the WIT worlds: root `wit/`, `rust/wasmtime/wit/world.wit`,
  `rust/guest-provider/wit/world.wit`, `conformance/wit/world.wit`,
  `examples/echo-demo/wit/world.wit`;
- `bindgen!` configs (interface paths appear in per-function import
  overrides and `with:` maps): `rust/wasmtime/src/bindings.rs`,
  `examples/wasmtime-demo/src/lib.rs`;
- `wit_bindgen::generate!` in the suite (`conformance/guest-ct/src/lib.rs`)
  and its import paths in `guest-ct/src/body.rs`;
- the deltic imports records, keyed by verbatim versioned WIT id and
  failing at run time rather than build time: `js/deltic/websocket.ts`
  (`CONNECTIONS_INTERFACE`, `websocketImports`), the parity carrier
  (`js/componentize/wpt/parity/deltic-carrier.ts`), and the exported
  export ids in `examples/deltic-demo/run.ts`;
- the deltic host module's exported resource-class names, which the
  embedder maps by resource name: `js/deltic/websocket.ts`.

Before designing WIT or touching async/stream plumbing, consult
[`lann/wasm-component-starter`](https://github.com/lann/wasm-component-starter)
(especially `OUTLINE.md`) — treat it as a living knowledge base and re-read
it rather than relying on a cached summary.

## Design invariants

These come from the README's design notes; changing one is a design
decision to record, not a refactor.

- **One copy of the shared WIT package.** The `polymorph:websocket` package is
  defined exactly once, at the root `wit/`. Components pull it in through
  `wit/deps` **symlinks** back to the root. Do not copy the package into a
  component or replace those symlinks with real directories.
- **The JS host must stay browser-compatible.** `js/deltic/websocket.ts`
  uses only the standard `WebSocket` API — no `node:` modules, no
  Deno-only APIs: the same file must load in a browser unchanged (the
  deltic-browser conformance row and the Chromium parity leg both depend
  on it).
- **The browser API bounds the portable surface.** Capabilities the browser
  `WebSocket` cannot serve (headers, client certs, ping/pong, trust
  decisions) do not appear on the ungated surface. Divergence between
  implementations is resolved, never accumulated — apply the webcrypto
  sibling's portability ladder in order: design it out; enhance the
  deficient implementation; narrow uniformly; record latitude at the
  definition site; isolate behind a gate or withheld export. A divergence
  with no artifact is a bug.
- **Message boundaries are preserved.** The interface is message-oriented;
  do not flatten it into a byte stream.
- **Client-only.** A listener surface is additive, if ever wanted; do not
  let server-side concerns shape the client resource.
- **The in-guest provider's TLS posture stays off the shared surface.**
  `wss:` in-guest comes from composing `polymorph:tls` with explicit,
  fail-closed trust anchors (see `rust/guest-provider/README.md`); trust
  decisions never appear on the WIT.

## Check the rationale before implementing it

Requests arrive with a reason attached. The reason is a claim about the
code, and it can be false while the request still points at something real.
Establish that it holds before writing the change, and if it does not, say
so first. A contradiction turned up while researching is a result to
report, not an obstacle to route around. Separate what is wrong with the
code now from what the proposed remedy fixes — they are often both true of
*different* problems; name which property the change actually buys.

## WIT doc comments

Every WIT comment is a doc comment: bindings generators project it into
library documentation, so its audience is the package's *consumers*, not
this repository's contributors. Package-wide contracts (streaming, close
semantics, error contract) live in a `wit/README.md`, referenced by name
from item docs — never restated in full at a use site, never living only
inside one item's doc. Basic usage first, critical caveats never buried
mid-paragraph behind mechanics. Use Simplified Technical English as
guidance: short sentences, active voice, one instruction per sentence,
consistent terms. No repository-internal content (implementations, test
harnesses, design history) on the package surface.

## Code comments and docs

Code comments describe **what** something is or does, not the process by
which it was arrived at. Rationale like "we removed X because Y" belongs in
commit messages or PR descriptions. Comment what a reader could not
predict: an invariant, a hazard, a deliberate departure from the obvious
choice, a constraint imposed from outside the file — never a defence of the
presence of ordinary code. Answers to an objection belong where the
objection was raised (the pull request), not in source. Guards are the
exception: a test or assertion exists *because* of the failure it prevents,
so saying what it catches describes what it is.

Docs state invariants, not inventories. Never embed values a build or test
run computes; if a number matters, a gate asserts it.

## Sizing pull requests

Three factors, binding in order:

1. **Necessity.** Changes that cannot land separately without leaving
   `main` worse between them go in one PR, whatever that does to its size.
   Once conformance gates all implementations against one behavior, a
   change to the package surface is co-dependent across the WIT and every
   implementation *by construction* — name the co-dependence in the
   description.
2. **Cohesion.** One decision per PR: a single ruling plus its
   consequences. "And also" is the tell that two PRs are sharing a branch.
3. **Review time.** Within what the first two allow, smaller is better —
   except that many *nearly identical* changes are one PR, not many,
   because near-identical diffs review sublinearly. The test is textual
   similarity of the diffs, not thematic similarity of the work.

## Tracking open findings in GitHub issues

Open findings and design decisions live in this repository's GitHub issue
tracker (`gh issue list`), not in a TODO file. Before starting work that
touches an area, search the open issues — some encode contract decisions
the change should resolve, not work around. Close issues through PRs with
closing-keyword lines (`Fixes #N`); when a PR resolves only part of an
issue, tick the resolved items and comment naming the PR. File new issues
for new findings rather than adding TODO comments or files.
