import type { DatabaseSync } from "node:sqlite";

import type { Model } from "./model.ts";
import type { Note } from "./note.ts";
import { Package } from "./package.ts";
import { assertSafeInteger, type IdGenerator } from "./util.ts";

export class Deck {
  deckId: number;
  name: string;
  description: string;
  notes: Note[] = [];
  /** Models by id; the models of added notes are picked up automatically on write. */
  models = new Map<number, Model>();

  constructor(deckId: number, name: string, description = "") {
    this.deckId = deckId;
    this.name = name;
    this.description = description;
  }

  addNote(note: Note): void {
    this.notes.push(note);
  }

  addModel(model: Model): void {
    this.models.set(model.modelId, model);
  }

  toAnkiJson(): Record<string, unknown> {
    return {
      collapsed: false,
      conf: 1,
      desc: this.description,
      dyn: 0,
      extendNew: 0,
      extendRev: 50,
      id: this.deckId,
      lrnToday: [163, 2],
      mod: 1425278051,
      name: this.name,
      newToday: [163, 2],
      revToday: [163, 0],
      timeToday: [163, 23598],
      usn: -1,
    };
  }

  writeToDb(db: DatabaseSync, timestamp: number, ids: IdGenerator): void {
    assertSafeInteger(this.deckId, "Deck deckId");
    if (typeof this.name !== "string") {
      throw new TypeError(`Deck name must be a string, not ${String(this.name)}.`);
    }

    const { decks: decksJson, models: modelsJson } = db
      .prepare("SELECT decks, models FROM col")
      .get() as { decks: string; models: string };

    const decks = JSON.parse(decksJson) as Record<string, unknown>;
    decks[String(this.deckId)] = this.toAnkiJson();
    db.prepare("UPDATE col SET decks = ?").run(JSON.stringify(decks));

    for (const note of this.notes) {
      this.addModel(note.model);
    }
    const models = JSON.parse(modelsJson) as Record<string, unknown>;
    for (const model of this.models.values()) {
      models[String(model.modelId)] = model.toAnkiJson(timestamp, this.deckId);
    }
    db.prepare("UPDATE col SET models = ?").run(JSON.stringify(models));

    for (const note of this.notes) {
      note.writeToDb(db, timestamp, this.deckId, ids);
    }
  }

  /** Write this deck as a `.apkg` file. */
  async writeToFile(file: string, timestamp?: number): Promise<void> {
    await new Package(this).writeToFile(file, timestamp);
  }
}
