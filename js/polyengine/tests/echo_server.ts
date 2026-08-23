// A local WebSocket echo server for the port's unit tests (`Deno.serve` +
// `Deno.upgradeWebSocket`). Deliberately a *small* subset of the consumer's
// `conformance-echod` protocol — just what the unit tests stimulate; the
// real thing is spawned by conformance/run.ts.
//
// Paths (mirroring conformance/server/PROTOCOL.md where they overlap):
//   /echo                     echo every message verbatim; echo the close frame
//   /echo?protocol=NAME       select NAME if offered
//   /stall                    never answer the handshake
//   /burst?count=N&size=S     send N binary messages of S bytes, then idle

export interface TestServer {
  base: string;
  close(): Promise<void>;
}

/** The payload `/burst` sends for message `index` (echod's rule). */
export function burstPayload(index: number, size: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = (index + i) % 256;
  return out;
}

export async function startEchoServer(): Promise<TestServer> {
  const sockets = new Set<WebSocket>();
  let resolvePort: (p: number) => void;
  const portReady = new Promise<number>((r) => (resolvePort = r));

  const ac = new AbortController();
  const server = Deno.serve(
    {
      hostname: "127.0.0.1",
      port: 0,
      signal: ac.signal,
      onListen: ({ port }) => resolvePort(port),
      onError: (e) => new Response(String(e), { status: 500 }),
    },
    (req) => handle(req, sockets),
  );

  const port = await portReady;
  return {
    base: `ws://127.0.0.1:${port}`,
    async close() {
      for (const ws of sockets) {
        try {
          ws.close();
        } catch { /* already closing */ }
      }
      sockets.clear();
      ac.abort();
      try {
        await server.finished;
      } catch { /* aborted */ }
    },
  };
}

function handle(req: Request, sockets: Set<WebSocket>): Response | Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === "/stall") {
    // Never answer: hold the request open until the client gives up.
    return new Promise<Response>(() => {});
  }
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("not a websocket request", { status: 400 });
  }

  const offered = (req.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const wanted = url.searchParams.get("protocol");
  // Selected only when actually offered: `Deno.upgradeWebSocket` refuses to
  // select an unoffered subprotocol, so the "server forced an unoffered
  // protocol" row is left to the real conformance server.
  const selected = wanted !== null && offered.includes(wanted) ? wanted : undefined;
  const { socket, response } = Deno.upgradeWebSocket(req, { protocol: selected });
  sockets.add(socket);
  socket.binaryType = "arraybuffer";
  socket.addEventListener("close", () => sockets.delete(socket));

  if (url.pathname === "/echo") {
    socket.addEventListener("message", (e) => {
      const data = (e as MessageEvent).data;
      try {
        socket.send(typeof data === "string" ? data : new Uint8Array(data as ArrayBuffer));
      } catch { /* closing */ }
    });
  } else if (url.pathname === "/burst") {
    const count = Number(url.searchParams.get("count") ?? "1");
    const size = Number(url.searchParams.get("size") ?? "16");
    socket.addEventListener("open", () => {
      for (let i = 0; i < count; i++) {
        try {
          socket.send(burstPayload(i, size));
        } catch { /* closing */ }
      }
    });
  }

  return response;
}

/**
 * A raw TCP stub that accepts a connection, drains whatever the client
 * writes, and never answers — so a client's handshake stays pending until
 * the client itself gives up. Unlike `/stall` above it is a bare
 * `Deno.listen`, which is what lets a test observe the *socket* lifecycle:
 * when the connection was accepted, and when the client's end went away.
 */
export interface StallStub {
  base: string;
  /** Resolves once a client connection has been accepted. */
  accepted: Promise<void>;
  /** Resolves once the accepted connection's read settles — the client closed. */
  clientGone: Promise<void>;
  close(): Promise<void>;
}

export function startStallStub(): StallStub {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  const conns: Deno.Conn[] = [];
  const readers: Promise<void>[] = [];

  let markAccepted!: () => void;
  const accepted = new Promise<void>((r) => (markAccepted = r));
  let markGone!: () => void;
  const clientGone = new Promise<void>((r) => (markGone = r));

  const serving = (async () => {
    try {
      for await (const conn of listener) {
        conns.push(conn);
        markAccepted();
        readers.push((async () => {
          const buf = new Uint8Array(1024);
          try {
            // Drain the upgrade request and answer nothing. The read settles
            // only when the peer closes or resets.
            while (await conn.read(buf) !== null) { /* keep draining */ }
          } catch { /* a reset is the client going away too */ }
          markGone();
        })());
      }
    } catch { /* the listener was closed */ }
  })();

  return {
    base: `ws://127.0.0.1:${port}`,
    accepted,
    clientGone,
    async close() {
      try {
        listener.close();
      } catch { /* already closed */ }
      for (const c of conns) {
        try {
          c.close();
        } catch { /* already closed */ }
      }
      await serving;
      await Promise.all(readers);
    },
  };
}
