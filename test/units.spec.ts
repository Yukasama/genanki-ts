import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BASIC_MODEL, CLOZE_MODEL, Deck, guidFor, Model, Note, Package } from "../src/index.ts";
import { render } from "../src/mustache.ts";
import { createZip } from "../src/zip.ts";
import { openCollection, readZip } from "./helpers.ts";

describe("guidFor", () => {
  // Expected values come from Python genanki's guid_for.
  it.each([
    [["Front", "Back"], "n.HtO+~]Di"],
    [["a"], "IkF(BOZ;]l"],
    [[1, 2], "Qlb:>1my~&"],
    [["ünï", "cödé"], "z>pv@17F`E"],
  ] as const)("guidFor(%j) === %s", (values, expected) => {
    expect(guidFor(...values)).toBe(expected);
  });
});

describe("mustache", () => {
  it("renders variables, sections and inverted sections", () => {
    const view = { A: "1", B: "" };
    expect(render("{{A}}|{{B}}|{{{A}}}|{{&A}}", view)).toBe("1||1|1");
    expect(render("{{#A}}yes{{/A}}{{#B}}no{{/B}}", view)).toBe("yes");
    expect(render("{{^A}}no{{/A}}{{^B}}yes{{/B}}", view)).toBe("yes");
    expect(render("a{{! ignored }}b", view)).toBe("ab");
    expect(render("{{ A }}", view)).toBe("1");
  });

  it("treats filters like {{cloze:Text}} as unknown names", () => {
    expect(render("{{cloze:Text}}", { Text: "x" })).toBe("");
  });

  it("rejects unbalanced sections", () => {
    expect(() => render("{{#A}}x", {})).toThrow(/Unclosed/);
    expect(() => render("x{{/A}}", {})).toThrow(/Unexpected closing/);
    expect(() => render("{{#A}}x{{/B}}", {})).toThrow(/Unexpected closing/);
  });
});

describe("Model", () => {
  it("computes req like genanki", () => {
    expect(BASIC_MODEL.req).toEqual([[0, "all", [0]]]);
    expect(CLOZE_MODEL.req).toEqual([[0, "all", [0, 1]]]);
  });

  it("falls back to 'any' when no field is individually required", () => {
    const model = new Model({
      modelId: 1,
      name: "any",
      fields: [{ name: "A" }, { name: "B" }],
      templates: [{ name: "t", qfmt: "{{A}}{{B}}", afmt: "" }],
    });
    // Emptying one field still leaves the other, so neither is required alone.
    expect(model.req).toEqual([[0, "any", [0, 1]]]);
  });

  it("throws when required fields cannot be determined", () => {
    const model = new Model({
      modelId: 1,
      name: "no fields",
      fields: [],
      templates: [{ name: "t", qfmt: "static", afmt: "" }],
    });
    expect(() => model.req).toThrow(/required fields/);
  });

  it("recomputes req after templates are reassigned", () => {
    const model = new Model({
      modelId: 1,
      name: "m",
      fields: [{ name: "A" }, { name: "B" }],
      templates: [{ name: "t", qfmt: "{{A}}", afmt: "" }],
    });
    expect(model.req).toEqual([[0, "all", [0]]]);
    model.templates = [{ name: "t", qfmt: "{{B}}", afmt: "" }];
    expect(model.req).toEqual([[0, "all", [1]]]);
  });

  it("does not mutate the input fields and templates", () => {
    const fields = [{ name: "A" }];
    const templates = [{ name: "t", qfmt: "{{A}}", afmt: "" }];
    const json = new Model({ modelId: 1, name: "m", fields, templates }).toAnkiJson(1, 2);
    expect(fields).toEqual([{ name: "A" }]);
    expect(templates).toEqual([{ name: "t", qfmt: "{{A}}", afmt: "" }]);
    expect(json.flds).toEqual([
      { name: "A", ord: 0, font: "Liberation Sans", media: [], rtl: false, size: 20, sticky: false },
    ]);
    expect(json.id).toBe("1");
  });

  it("rejects non-integer ids", () => {
    expect(
      () => new Model({ modelId: 1.5, name: "m", fields: [], templates: [] }),
    ).toThrow(/safe integer/);
  });
});

describe("Note", () => {
  it("derives guid, sort field and tags", () => {
    const note = new Note({ model: BASIC_MODEL, fields: ["Front", "Back"] });
    expect(note.guid).toBe("n.HtO+~]Di");
    expect(note.sortField).toBe("Front");
    expect(new Note({ model: BASIC_MODEL, fields: ["a", "b"], sortField: "x" }).sortField).toBe("x");
  });

  it("rejects tags with spaces", () => {
    expect(() => new Note({ model: BASIC_MODEL, fields: ["a", "b"], tags: ["bad tag"] })).toThrow(/space/);
    const note = new Note({ model: BASIC_MODEL, fields: ["a", "b"] });
    expect(() => {
      note.tags = ["ok", "not ok"];
    }).toThrow(/space/);
  });

  it("makes one cloze card per distinct number", () => {
    const note = new Note({ model: CLOZE_MODEL, fields: ["{{c2::a}} {{c1::b}} {{c2::c}}\n{{c4::d}}", ""] });
    expect(note.cards.map((card) => card.ord)).toEqual([0, 1, 3]);
  });

  it("gives a cloze note without deletions one card", () => {
    // Python genanki's `card_ords == {}` never matches a set, so it emits no card here.
    expect(new Note({ model: CLOZE_MODEL, fields: ["plain", ""] }).cards.map((c) => c.ord)).toEqual([0]);
  });

  it("skips templates whose required fields are empty", () => {
    expect(new Note({ model: BASIC_MODEL, fields: ["", "b"] }).cards).toHaveLength(0);
  });

  it("validates the field count on write", async () => {
    const deck = new Deck(1, "d");
    deck.addNote(new Note({ model: BASIC_MODEL, fields: ["only one"] }));
    await expect(new Package(deck).toBuffer()).rejects.toThrow(/Number of fields/);
  });

  it("warns about invalid HTML and pads single-field CLOZE_MODEL notes", async () => {
    const warnings: Error[] = [];
    const listener = (w: Error) => warnings.push(w);
    process.on("warning", listener);

    const deck = new Deck(1, "d");
    deck.addNote(new Note({ model: BASIC_MODEL, fields: ["1 < 2 and 3 > 2", "b"] }));
    deck.addNote(new Note({ model: CLOZE_MODEL, fields: ["{{c1::x}}"] }));
    const { db } = openCollection(await new Package(deck).toBuffer());
    await new Promise((resolve) => setImmediate(resolve));
    process.off("warning", listener);

    expect(warnings.map((w) => w.name).sort()).toEqual(["DeprecationWarning", "GenankiWarning"]);
    expect(db.prepare("SELECT flds FROM notes ORDER BY id DESC").get()).toEqual({ flds: "{{c1::x}}\x1f" });
  });
});

describe("Deck", () => {
  it("validates its id", async () => {
    await expect(new Package(new Deck(1.5, "d")).toBuffer()).rejects.toThrow(/deckId/);
    await expect(new Package(new Deck(1, undefined as never)).toBuffer()).rejects.toThrow(/name/);
  });

  it("registers models that were added explicitly but have no notes", async () => {
    const deck = new Deck(1, "d");
    deck.addModel(BASIC_MODEL);
    const { db } = openCollection(await new Package(deck).toBuffer());
    const models = JSON.parse((db.prepare("SELECT models FROM col").get() as { models: string }).models);
    expect(Object.keys(models)).toEqual([String(BASIC_MODEL.modelId)]);
  });
});

describe("Package", () => {
  const deck = new Deck(7, "d");
  deck.addNote(new Note({ model: BASIC_MODEL, fields: ["q", "a"] }));

  it("is reproducible for a fixed timestamp", async () => {
    const a = await new Package(deck).toBuffer(1_700_000_000);
    const b = await new Package(deck).toBuffer(1_700_000_000);
    expect(a.equals(b)).toBe(true);
  });

  it("reads media from disk under the basename", async () => {
    const dir = await mkdtemp(join(tmpdir(), "genanki-"));
    const path = join(dir, "pic.png");
    await writeFile(path, "data");
    const { files } = openCollection(await new Package(deck, [path]).toBuffer());
    expect(JSON.parse(files.get("media")!.toString())).toEqual({ 0: "pic.png" });
    expect(files.get("0")!.toString()).toBe("data");
  });

  it("writes a valid file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "genanki-"));
    const file = join(dir, "deck.apkg");
    await deck.writeToFile(file);
    expect([...readZip(await readFile(file)).keys()]).toEqual(["collection.anki2", "media"]);
  });

  it("produces a database Anki can read", async () => {
    const { db } = openCollection(await new Package(deck).toBuffer());
    expect(db.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    expect(db.prepare("SELECT count(*) AS n FROM notes").get()).toEqual({ n: 1 });
  });
});

describe("createZip", () => {
  it("round-trips stored and deflated entries", () => {
    const big = Buffer.alloc(10_000, "abc");
    const zip = createZip(
      [
        { name: "ä.txt", data: Buffer.from("hi") },
        { name: "big", data: big, compress: true },
      ],
      0,
    );
    const files = readZip(zip);
    expect(files.get("ä.txt")!.toString()).toBe("hi");
    expect(files.get("big")!.equals(big)).toBe(true);
    expect(zip.length).toBeLessThan(big.length);
  });
});
