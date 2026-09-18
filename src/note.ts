import type { DatabaseSync } from "node:sqlite";

import { CLOZE_MODEL } from "./builtin-models.ts";
import { Card } from "./card.ts";
import { Model } from "./model.ts";
import { guidFor, type IdGenerator } from "./util.ts";

export interface NoteOptions {
  model: Model;
  fields: string[];
  sortField?: string;
  tags?: string[];
  guid?: string;
  due?: number;
}

/** Matches things that look like HTML tags but are not (e.g. a bare `<foo bar`). */
const INVALID_HTML_TAG_RE = /<(?!\/?[a-zA-Z0-9]+(?: .*|\/?)>|!--|!\[CDATA\[)(?:.|\n)*?>/g;
const CLOZE_FIELD_RES = [/\{\{[^}]*?cloze:(?:[^}]?:)*(.+?)\}\}/g, /<%cloze:(.+?)%>/g];
const CLOZE_NUMBER_RE = /\{\{c(\d+)::.+?\}\}/gs;

function validateTag(tag: string): void {
  if (tag.includes(" ")) {
    throw new Error(`Tag "${tag}" contains a space; this is not allowed!`);
  }
}

/**
 * The basic unit in Anki: a fact to memorize. A note belongs to a model and
 * produces one or more cards.
 */
export class Note {
  model: Model;
  fields: string[];
  guid: string;
  due: number;

  #sortField: string | undefined;
  #tags: string[] = [];
  #cards: Card[] | undefined;

  constructor(options: NoteOptions) {
    this.model = options.model;
    this.fields = options.fields;
    this.#sortField = options.sortField;
    this.tags = options.tags ?? [];
    this.due = options.due ?? 0;
    this.guid = options.guid ?? guidFor(...options.fields);
  }

  /** Falls back to the model's sort field. */
  get sortField(): string {
    return this.#sortField || this.fields[this.model.sortFieldIndex] || "";
  }

  set sortField(value: string | undefined) {
    this.#sortField = value;
  }

  get tags(): string[] {
    return this.#tags;
  }

  set tags(tags: string[]) {
    tags.forEach(validateTag);
    this.#tags = [...tags];
  }

  /**
   * Cards this note produces. Computed lazily (so `model` may be replaced
   * after construction) and then cached.
   */
  get cards(): Card[] {
    this.#cards ??= this.#buildCards();
    return this.#cards;
  }

  #buildCards(): Card[] {
    switch (this.model.modelType) {
      case Model.FRONT_BACK:
        return this.#frontBackCards();
      case Model.CLOZE:
        return this.#clozeCards();
      default:
        throw new Error("Expected modelType CLOZE or FRONT_BACK");
    }
  }

  /** One card per template whose required fields are filled in. */
  #frontBackCards(): Card[] {
    const cards: Card[] = [];
    for (const [cardOrd, anyOrAll, requiredFieldOrds] of this.model.req) {
      const filled = (ord: number) => Boolean(this.fields[ord]);
      const ok = anyOrAll === "any" ? requiredFieldOrds.some(filled) : requiredFieldOrds.every(filled);
      if (ok) {
        cards.push(new Card(cardOrd));
      }
    }
    return cards;
  }

  /** One card per distinct `{{cN::...}}` number referenced in the cloze field(s). */
  #clozeCards(): Card[] {
    const qfmt = this.model.templates[0]?.qfmt ?? "";
    const clozeFieldNames = new Set(
      CLOZE_FIELD_RES.flatMap((re) => [...qfmt.matchAll(re)].map((match) => match[1]!)),
    );

    const cardOrds = new Set<number>();
    for (const fieldName of clozeFieldNames) {
      const fieldIndex = this.model.fields.findIndex((field) => field.name === fieldName);
      const fieldValue = (fieldIndex >= 0 ? this.fields[fieldIndex] : "") ?? "";
      for (const match of fieldValue.matchAll(CLOZE_NUMBER_RE)) {
        const number = Number(match[1]);
        if (number > 0) {
          cardOrds.add(number - 1);
        }
      }
    }
    if (cardOrds.size === 0) {
      cardOrds.add(0);
    }
    return [...cardOrds].sort((a, b) => a - b).map((ord) => new Card(ord));
  }

  #checkFieldCount(): void {
    if (this.model.fields.length !== this.fields.length) {
      throw new Error(
        `Number of fields in Model does not match number of fields in Note: ` +
          `${this.model.name} has ${this.model.fields.length} fields, ` +
          `but the note has ${this.fields.length} fields.`,
      );
    }
  }

  #checkInvalidHtmlTags(): void {
    for (const field of this.fields) {
      const invalid = field.match(INVALID_HTML_TAG_RE);
      if (invalid) {
        process.emitWarning(
          "Field contained the following invalid HTML tags. Make sure you are escaping " +
            `your field data if it isn't already HTML-encoded: ${invalid.join(" ")}`,
          { type: "GenankiWarning" },
        );
      }
    }
  }

  writeToDb(db: DatabaseSync, timestamp: number, deckId: number, ids: IdGenerator): void {
    this.#fixDeprecatedClozeModel();
    this.#checkFieldCount();
    this.#checkInvalidHtmlTags();
    this.#tags.forEach(validateTag);

    const noteId = ids.next();
    db.prepare("INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
      noteId, // id
      this.guid, // guid
      this.model.modelId, // mid
      Math.trunc(timestamp), // mod
      -1, // usn
      ` ${this.#tags.join(" ")} `, // tags
      this.fields.join("\x1f"), // flds
      this.sortField, // sfld
      0, // csum, can be ignored
      0, // flags
      "", // data
    );

    for (const card of this.cards) {
      card.writeToDb(db, timestamp, deckId, noteId, ids, this.due);
    }
  }

  /** Old callers passed only the cloze text to `CLOZE_MODEL`; pad the second field. */
  #fixDeprecatedClozeModel(): void {
    if (this.model === CLOZE_MODEL && this.fields.length === 1) {
      this.fields = [...this.fields, ""];
      process.emitWarning(
        `Using CLOZE_MODEL with a single field is deprecated. Please pass two fields, e.g. ${JSON.stringify(this.fields)}.`,
        { type: "DeprecationWarning" },
      );
    }
  }
}
