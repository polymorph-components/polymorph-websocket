// The embedder half of the parity runner's `wpt:parity/reporter` import:
// the round trip's carrier bundle (parity/polyengine-carrier.ts) provides
// this module as that interface, so whichever environment loads the
// carrier installs its sink through the carrier's re-exported `setSink`
// before invoking `run`, and receives each record as the test settles.
//
// MODULE IDENTITY: after bundling, the carrier's copy of this module is a
// distinct instance — always take `setSink` from the carrier, never by
// importing this file directly alongside it (see the carrier's header).
// Dependency-free and browser-safe.

let sink = null;

/** @param {((record: string) => void) | null} fn */
export function setSink(fn) {
  sink = fn;
}

export const reporter = {
  /** @param {string} record */
  report(record) {
    if (sink === null) {
      throw new Error("wpt parity reporter: no sink installed (call setSink before run)");
    }
    sink(record);
  },
};
