import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BASIC_AND_REVERSED_CARD_MODEL,
  BASIC_MODEL,
  BASIC_OPTIONAL_REVERSED_CARD_MODEL,
  BASIC_TYPE_IN_THE_ANSWER_MODEL,
  CLOZE_MODEL,
  Deck,
  Model,
  Note,
  Package,
} from "../src/index.ts";
import { openCollection } from "./helpers.ts";

/**
 * `parity.golden.json` was produced by Python genanki 0.13.1 from the same
 * deck (script: `test/parity_dump.py`). Every row and JSON blob has to match,
 * so decks built here import in Anki exactly like the original's.
 */
const golden = JSON.parse(readFileSync(new URL("./parity.golden.json", import.meta.url), "utf8"));

const custom = new Model({
  modelId: 1607392319,
  name: "Docuvalley Basic",
  fields: [{ name: "Front" }, { name: "Back" }],
  templates: [{ name: "Card 1", qfmt: "{{Front}}", afmt: '{{FrontSide}}<hr id="answer">{{Back}}' }],
});
const cloze = new Model({
  modelId: 1607392320,
  name: "Docuvalley Cloze",
  fields: [{ name: "Text" }, { name: "Extra" }],
  templates: [
    { name: "Cloze Card", qfmt: "{{cloze:Text}}", afmt: '{{cloze:Text}}<hr id="answer">{{Extra}}' },
  ],
  modelType: Model.CLOZE,
});

function buildPackage(): Package {
  const deck = new Deck(123456789, "Parity Deck", "desc");
  deck.addNote(new Note({ model: custom, fields: ["Q1", "A1"], guid: "g-1-basic" }));
  deck.addNote(new Note({ model: custom, fields: ["Q2 <b>bold</b>", ""], tags: ["a", "b"] }));
  deck.addNote(
    new Note({ model: cloze, fields: ["{{c1::x}} and {{c3::y}} {{c1::z}}", "extra"], guid: "g-cloze", due: 5 }),
  );
  deck.addNote(new Note({ model: BASIC_AND_REVERSED_CARD_MODEL, fields: ["F", "B"] }));
  deck.addNote(new Note({ model: BASIC_OPTIONAL_REVERSED_CARD_MODEL, fields: ["F", "B", ""] }));
  deck.addNote(new Note({ model: BASIC_OPTIONAL_REVERSED_CARD_MODEL, fields: ["F", "B", "y"] }));
  deck.addNote(new Note({ model: BASIC_TYPE_IN_THE_ANSWER_MODEL, fields: ["F", "B"], sortField: "sortme" }));
  deck.addNote(new Note({ model: CLOZE_MODEL, fields: ["{{c2::a}}", ""] }));

  const deck2 = new Deck(42, "Second");
  deck2.addNote(new Note({ model: BASIC_MODEL, fields: ["ünï", "cödé"] }));

  return new Package([deck, deck2], [{ name: "pic.png", data: Buffer.from("\x89PNGfake", "latin1") }]);
}

describe("parity with Python genanki 0.13.1", () => {
  const timestamp = 1_700_000_000.5;
  const rows = (db: ReturnType<typeof openCollection>["db"], table: string) =>
    db
      .prepare(`SELECT * FROM ${table} ORDER BY id`)
      .all()
      .map((row) => Object.values(row));

  it("writes identical notes and cards", async () => {
    const { db } = openCollection(await buildPackage().toBuffer(timestamp));
    expect(rows(db, "notes")).toEqual(golden.notes);
    expect(rows(db, "cards")).toEqual(golden.cards);
  });

  it("writes an identical col row (conf, models, decks, dconf)", async () => {
    const { db } = openCollection(await buildPackage().toBuffer(timestamp));
    const col = Object.values(db.prepare("SELECT * FROM col").get()!);
    expect([col.slice(0, 8), ...col.slice(8).map((json) => JSON.parse(json as string))]).toEqual(golden.col);
  });

  it("writes the media manifest and files", async () => {
    const { files } = openCollection(await buildPackage().toBuffer(timestamp));
    expect([...files.keys()].sort()).toEqual(golden.names);
    expect(JSON.parse(files.get("media")!.toString())).toEqual(golden.media);
    expect(files.get("0")!.toString("hex")).toBe(golden.mediaData);
  });
});
