// The `wasi:sockets` import fragment for the parity carrier's deltic
// instantiation.
//
// The componentize-js runtime imports the seven `wasi:sockets@0.2`
// interfaces unconditionally, and deltic's `wasi()` deliberately
// excludes sockets (mission scope: p2 baseline + p3 clocks). The parity
// runner never opens a socket — every WebSocket it drives goes through
// `polymorph:websocket/connections` — so every member here exists only to
// satisfy the import check, and throws if actually reached, which would
// mean the runner grew a socket dependency this stub is silently
// breaking.
//
// This is the deltic-keyed reshape of the jco-era `sockets-stub.mjs`
// (same inventory, same throw-if-reached posture; removed with the jco
// legs, see git history). Keys are compatibility-**track** keys (`@0.2`),
// the same registration form `@deltic/wasi` uses, so one provider
// serves whichever 0.2.x minor the guest's binary happens to name
// (contracts/embedder-api.md §"Version canonicalization").

const unreachable = (what) => {
  throw new Error(`wasi:sockets is stubbed in the parity carrier: ${what} was called`);
};

class StubResource {
  constructor() {
    unreachable(new.target.name);
  }
}

export class ResolveAddressStream extends StubResource {}
export class Network extends StubResource {}
export class TcpSocket extends StubResource {}
export class UdpSocket extends StubResource {}
export class IncomingDatagramStream extends StubResource {}
export class OutgoingDatagramStream extends StubResource {}

/** The imports-record fragment: `{ ...socketsStubs() }` beside `wasi()`. */
export function socketsStubs() {
  return {
    "wasi:sockets/instance-network@0.2": {
      instanceNetwork: () => unreachable("instance-network.instance-network"),
    },
    "wasi:sockets/ip-name-lookup@0.2": {
      ResolveAddressStream,
      resolveAddresses: () => unreachable("ip-name-lookup.resolve-addresses"),
    },
    "wasi:sockets/network@0.2": { Network },
    "wasi:sockets/tcp@0.2": { TcpSocket },
    "wasi:sockets/tcp-create-socket@0.2": {
      createTcpSocket: () => unreachable("tcp-create-socket.create-tcp-socket"),
    },
    "wasi:sockets/udp@0.2": {
      UdpSocket,
      IncomingDatagramStream,
      OutgoingDatagramStream,
    },
    "wasi:sockets/udp-create-socket@0.2": {
      createUdpSocket: () => unreachable("udp-create-socket.create-udp-socket"),
    },
  };
}
