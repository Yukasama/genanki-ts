import { DatabaseSync } from "node:sqlite";
import { crc32, inflateRawSync } from "node:zlib";

/** Minimal zip reader for tests; verifies CRCs so a broken archive fails loudly. */
export function readZip(buf: Buffer): Map<string, Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central header");
    const method = buf.readUInt16LE(p + 10);
    const checksum = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen;

    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const body = buf.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    if (crc32(data) !== checksum) throw new Error(`crc mismatch for ${name}`);
    files.set(name, data);
  }
  return files;
}

export function openCollection(apkg: Buffer): { db: DatabaseSync; files: Map<string, Buffer> } {
  const files = readZip(apkg);
  const db = new DatabaseSync(":memory:");
  db.deserialize(files.get("collection.anki2")!);
  return { db, files };
}
