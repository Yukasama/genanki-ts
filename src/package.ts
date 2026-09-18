import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { APKG_COL, APKG_SCHEMA } from "./apkg.ts";
import type { Deck } from "./deck.ts";
import { createZip, type ZipEntry } from "./zip.ts";
import { IdGenerator } from "./util.ts";

/** A media file: a path on disk (stored under its basename) or in-memory bytes. */
export type MediaFile = string | { name: string; data: Uint8Array };

export class Package {
  decks: Deck[];
  mediaFiles: MediaFile[];

  constructor(deckOrDecks: Deck | Deck[], mediaFiles: MediaFile[] = []) {
    this.decks = Array.isArray(deckOrDecks) ? deckOrDecks : [deckOrDecks];
    this.mediaFiles = mediaFiles;
  }

  /**
   * Build the `.apkg` and return its bytes.
   *
   * @param timestamp Seconds since the Unix epoch, assigned to generated
   *   notes and cards (and used to derive their ids). Pass a fixed value to
   *   make the output reproducible. Defaults to now.
   */
  async toBuffer(timestamp: number = Date.now() / 1000): Promise<Buffer> {
    const media = await Promise.all(
      this.mediaFiles.map(async (file) =>
        typeof file === "string"
          ? { name: basename(file), data: await readFile(file) }
          : { name: file.name, data: file.data },
      ),
    );

    const entries: ZipEntry[] = [
      { name: "collection.anki2", data: this.#buildDatabase(timestamp), compress: true },
      {
        name: "media",
        data: Buffer.from(JSON.stringify(Object.fromEntries(media.map((m, idx) => [idx, m.name])))),
        compress: true,
      },
      ...media.map((m, idx) => ({ name: String(idx), data: m.data })),
    ];
    return createZip(entries, timestamp * 1000);
  }

  /** Write the `.apkg` to `file`. See {@link toBuffer} for `timestamp`. */
  async writeToFile(file: string, timestamp?: number): Promise<void> {
    await writeFile(file, await this.toBuffer(timestamp));
  }

  /** Create the SQLite collection and return the database file image. */
  #buildDatabase(timestamp: number): Uint8Array {
    const db = new DatabaseSync(":memory:");
    try {
      this.writeToDb(db, timestamp, new IdGenerator(Math.trunc(timestamp * 1000)));
      return db.serialize();
    } finally {
      db.close();
    }
  }

  writeToDb(db: DatabaseSync, timestamp: number, ids: IdGenerator): void {
    db.exec(APKG_SCHEMA);
    const col = APKG_COL;
    db.prepare("INSERT INTO col VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      col.id,
      col.crt,
      col.mod,
      col.scm,
      col.ver,
      col.dty,
      col.usn,
      col.ls,
      JSON.stringify(col.conf),
      JSON.stringify(col.models),
      JSON.stringify(col.decks),
      JSON.stringify(col.dconf),
      JSON.stringify(col.tags),
    );

    for (const deck of this.decks) {
      deck.writeToDb(db, timestamp, ids);
    }
  }
}
