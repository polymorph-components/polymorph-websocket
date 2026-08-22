# `js/polyengine` — the polyengine-native `polymorph:websocket` host module

`websocket.ts` is **the** JS host for `polymorph:websocket`: the standard
`WebSocket` API only, no `node:` modules, no runtime dependencies, and it
carries every JS-host row of the conformance matrix (Deno and headless
Chromium). It began as the [deltic](https://github.com/lann/deltic)-native
port of the browser-first reference host `js/jco/websocket.js` (retired
with the jco legs at commit c9252be; see git history), rewritten over
deltic's embedder API (typed `Stream<T>` / `ReadableStream` rather than
bare-payload `Stream`, and `ComponentException` throws rather than
`throw { tag, val }`) — deltic has since been renamed
[polyengine](https://github.com/polymorph-components/polyengine). It was
developed as deltic's own `ports/websocket` reference-host port and was
upstreamed here per [lann/deltic#14](https://github.com/lann/deltic/issues/14)
(historical: predates the rename); the WIT contract is
[`wit/websocket.wit`](../../wit/websocket.wit), and every doc comment
quoting a contract quotes that file.

## Behavioral delta vs. the retired `websocket.js`

Exactly one, and it is a **runtime** difference, not a design choice:

- **Abnormal-closure close code.** Browsers and Node deliver
  `CloseEvent.code === 1006` when the peer drops TCP with no close frame;
  **Deno delivers `0`**. Both mean "no close frame was received", so the
  port treats `{0, 1006, 1015}` as the synthesized set that maps to *no*
  `close-info`. `1005` is deliberately excluded — it is the legitimate
  observation of a code-less close frame, which the suite asserts. See
  `Websocket#settleClosed` for the full note.

Everything else — buffered-amount polling, the connect/close bounds, the
overflow-close rule, the receive-via-stream single-use rule — behaves
identically on Deno.

## Module identity

`deno.json`'s `@polyengine/runtime/embedder` import maps to the exact same
pinned URL as `conformance/driver-ct/polyengine/deno.json`. polyengine's
`wasi-shims` module imports that specifier by bare name internally; if the
two configs ever disagreed, the embedder module would load twice. This
module recognizes polyengine values by `@polyengine/protocol` brand
predicates (`isComponentException`, the `STREAM` brand), so recognition
holds even in a multi-copy graph — but a duplicated embedder still splits
the runtime/translator plan-format pairing, and stateful handles
(streams/futures) minted by one copy are refused by the other. Keep both
import maps byte-identical for that one entry.

## Unit tests

`deno task test` runs the module's unit tests against a local Deno echo server
(`tests/echo_server.ts`, a small subset of the real conformance echod's
protocol). `deno task check` type-checks `websocket.ts` and `tests/`
against the pinned release URLs, under the `dom` libs (`deno.json`'s
`compilerOptions.lib`): that is the browser consumer's configuration, and
its `WebSocket.send` signature is stricter than Deno's own declarations.
The Deno-default-lib configuration is covered by the conformance driver's
`check` task, which imports this module.

```sh
cd js/polyengine
deno task check
deno task test
```

The full behavioral surface is exercised by the real conformance suite,
which lives at [`conformance/driver-ct/polyengine/`](../../conformance/driver-ct/polyengine).
