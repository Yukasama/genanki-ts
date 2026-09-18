import type { DatabaseSync } from "node:sqlite";

import type { IdGenerator } from "./util.ts";

export class Card {
  ord: number;
  suspend: boolean;

  constructor(ord: number, suspend = false) {
    this.ord = ord;
    this.suspend = suspend;
  }

  writeToDb(
    db: DatabaseSync,
    timestamp: number,
    deckId: number,
    noteId: number,
    ids: IdGenerator,
    due = 0,
  ): void {
    const queue = this.suspend ? -1 : 0;
    db.prepare("INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      ids.next(), // id
      noteId, // nid
      deckId, // did
      this.ord, // ord
      Math.trunc(timestamp), // mod
      -1, // usn
      0, // type (=0 for non-Cloze)
      queue, // queue
      due, // due
      0, // ivl
      0, // factor
      0, // reps
      0, // lapses
      0, // left
      0, // odue
      0, // odid
      0, // flags
      "", // data
    );
  }
}
