import { createHash } from "node:crypto";

const BASE91_TABLE =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~";

/**
 * Deterministic note GUID: the first 8 bytes of the SHA-256 of the values
 * (joined with `__`), encoded in the "base91" alphabet Anki uses.
 *
 * Pass strings or integers. Values are stringified with `String()`, which
 * matches Python's `str()` for those types (but not for floats, booleans or
 * null), so GUIDs stay compatible with decks built by Python genanki.
 */
export function guidFor(...values: (string | number | bigint)[]): string {
  const hash = createHash("sha256").update(values.map(String).join("__"), "utf8").digest();
  let hashInt = hash.readBigUInt64BE(0);

  const base = BigInt(BASE91_TABLE.length);
  const reversed: string[] = [];
  while (hashInt > 0n) {
    reversed.push(BASE91_TABLE[Number(hashInt % base)]!);
    hashInt /= base;
  }
  return reversed.reverse().join("");
}

/** Monotonic id source; Anki wants unique ids across notes and cards. */
export class IdGenerator {
  #next: number;

  constructor(start: number) {
    this.#next = start;
  }

  next(): number {
    return this.#next++;
  }
}

export function assertSafeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer, not ${String(value)}.`);
  }
}
