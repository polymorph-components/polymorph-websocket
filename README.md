# `polymorph:websocket`

A WIT interface for WebSocket client connections, plus multiple
implementations that run the *same* guest component against real WebSocket
stacks — a sibling of
[`polymorph:webcrypto`](https://github.com/polymorph-components/polymorph-webcrypto) and
[`polymorph:webrtc-datachannels`](https://github.com/polymorph-components/polymorph-webrtc-datachannels),
deliberately mirroring their architecture.

One guest component binary runs unchanged against:

- a **browser-first** JS host ([`js/deltic`](js/deltic)): the standard
  `WebSocket` API only, zero runtime dependencies — the same file loads in
  a browser, under Deno, and under Node, runtime-linked by
  [deltic](https://github.com/lann/deltic) with no transpile step and no
  engine flag;
- a **native Rust** host ([`rust/wasmtime`](rust/wasmtime)): Wasmtime +
  [`tokio-tungstenite`], modeled after `wasmtime_wasi_http::p3`.

The [conformance suite](conformance) runs the shared guest's corpus against
every implementation — including inside a real headless Chromium — and
holds them to one behavior. Open questions and findings are tracked in the
[issues](../../issues).

[`tokio-tungstenite`]: https://github.com/snapview/tokio-tungstenite

## Releases

Everything here is **unstable** (0.x), but [releases](../../releases) are
**caret-honest**: within a minor line they stay backward-compatible, and
anything breaking bumps the minor. Consumption is pinned at a release's
commit — cargo git dependencies, vendored WIT, the release-pinned
deltic/JSR graph — and bumped deliberately.

## Why this exists

WebAssembly components have no standard WebSocket path today: `wasi:http`
carries request/response and has no upgrade mechanism, and `wasi:sockets`
gives raw TCP with no TLS, HTTP handshake, or framing. Meanwhile the
browser — the platform this family of packages treats as a first-class
deployment target — offers *only* WebSocket (and WebRTC) for long-lived
duplex connections.

The immediate consumer is
[`component-iroh`](https://github.com/polymorph-components/polymorph-iroh): an iroh
endpoint keeps a persistent secure WebSocket open to its home relay, and
publishes signed discovery records over HTTPS. The relay leg is exactly
the capability gap this package fills. But the interface is
general-purpose: message-oriented duplex connectivity that behaves
identically in a browser, on a native host, and (where feasible) fully
in-guest.

## What's here

| Path | Deliverable |
| --- | --- |
| [`wit/`](wit) | The `polymorph:websocket` package: a `types` interface for structural types and a `connections` interface owning the `websocket` resource. One copy at the root; consumers pull it in via `wit/deps` symlinks. Package-wide contracts live in [`wit/README.md`](wit/README.md). |
| [`js/deltic`](js/deltic) | The **browser-first JS host module** (`websocket.ts`): the standard `WebSocket` API only, no `node:` modules, no runtime dependencies, over [deltic](https://github.com/lann/deltic)'s embedder conventions (typed streams, `ComponentException`). Shared verbatim by the demo runner, the conformance JS-host rows, and the WPT parity round trip. |
| [`rust/wasmtime`](rust/wasmtime) | The **Wasmtime host crate** (`wasmtime-websocket`): `add_to_linker` + `WasiWebsocketView`, per-store `WasiWebsocketCtx` knobs for the bounds the WIT leaves implementation-defined. |
| [`js/componentize`](js/componentize) | The **browser-API shim** for componentize-js guests: the WHATWG `WebSocket` interface implemented over the WIT imports — the inverse of `js/deltic` — plus the **WPT parity gate**: vendored web-platform-tests run round-trip (shim → WIT → deltic → platform WebSocket) and held to the platform baseline's pass set. |
| [`rust/guest-provider`](rust/guest-provider) | The **in-guest provider** (`websocket-guest-provider`): a WebSocket client stack over `wasi:sockets` TCP, exporting the package surface as a composable component; `wss:` via the composed [`polymorph:tls`](https://github.com/polymorph-components/polymorph-tls) component. See its README for the TLS posture and configuration channel. |
| [`conformance/`](conformance) | The **cross-implementation conformance suite** on the [`polymorph:test`](https://github.com/polymorph-components/polymorph-test) harness: a shared guest suite (`guest-ct`, its committed `tests.lock` the corpus inventory), a suite-owned echo server with fault-injection modes, and the driver (`driver-ct`) that runs every target (wasmtime, composed, deltic under stock Deno, and deltic inside headless Chromium) into [the matrix](conformance/README.md). |
| [`examples/`](examples) | The **echo-demo guest component** plus native (`just demo::wasmtime`) and JS (`just demo::deltic`) runners against the suite echo server. |

## The interface

The package defines two interfaces (see [`wit/websocket.wit`](wit/websocket.wit)):

- **`types`** — the `error` variant, the `message` variant
  (`binary(list<u8>)` / `%string(string)`), the stream-backed
  `stream-message` form, `close-info`, and the lifecycle enum.
- **`connections`** — the `websocket` resource:
  - `connect: static async func(url, protocols)` resolves once the
    connection is open (so there is no observable `connecting` state);
  - `send`/`receive` carry exactly **one** message per call, preserving
    WebSocket message boundaries, with concurrent calls supported for
    pipelining;
  - `send-via-stream`/`receive-via-stream` carry each message's payload as
    a byte `stream` to bound in-guest buffering;
  - `state` is the lifecycle getter (mirroring the poll-only W3C
    `readyState`); `wait-closed` is the latched authority for close
    details (the peer's close frame, or `none` for an abnormal closure);
  - `close(code, reason)` validates eagerly against the codes a browser
    client may send and initiates the closing handshake.

The browser `WebSocket` API is the least capable implementation and bounds
the portable surface: no request headers, client certificates, proxy
control, trust decisions, or ping/pong access appear here. The
close-semantics contract — what `receive` and `wait-closed` observe around
local, remote-clean, and abnormal closes — is pinned in
[`wit/README.md`](wit/README.md) ("Close contract") and exercised by
conformance rows against the suite server's fault modes.

A shared shape with the webrtc sibling's `data-channel` is deliberate:
`component-iroh` wants to treat a relay WebSocket and a WebRTC data
channel as interchangeable message transports.

## Running it

Prerequisites: `rustup`, Node 24+ (the Node-side drivers), Deno (the
deltic legs; no engine flags anywhere), a Chrome/Chromium for the browser
conformance target (discovered from
the usual locations, or set `CHROME_PATH`), and `./scripts/setup.sh`
(installs the pinned `wasm-tools`/`wac`/`just`/`pnpm` and the JS package
trees).

```sh
./scripts/setup.sh
just check           # fmt + clippy + WIT validation + native tests
just conformance-ct  # the full matrix: wasmtime, composed, deltic-deno, deltic-browser
just demo::wasmtime  # the echo demo on the native host
just demo::deltic    # the same component runtime-linked under deltic
just ci              # exactly what CI runs
```

## Relationship to standards efforts

If a standard `wasi:websocket` (or an upgrade path in a future `wasi:http`)
materializes, this package's job becomes migration, not competition — the
same posture the siblings take toward their domains. The interface stays
small enough that mapping onto a standard surface is mechanical.
