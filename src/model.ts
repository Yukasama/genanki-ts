import { render } from "./mustache.ts";
import { assertSafeInteger } from "./util.ts";

export interface ModelField {
  name: string;
  font?: string;
  media?: unknown[];
  rtl?: boolean;
  size?: number;
  sticky?: boolean;
  [key: string]: unknown;
}

export interface ModelTemplate {
  name: string;
  /** Question format. */
  qfmt: string;
  /** Answer format. */
  afmt: string;
  bqfmt?: string;
  bafmt?: string;
  bfont?: string;
  bsize?: number;
  did?: number | null;
  [key: string]: unknown;
}

/** `[templateOrd, "all" | "any", requiredFieldOrds]` */
export type RequiredFields = [number, "all" | "any", number[]];

export interface ModelOptions {
  modelId: number;
  name: string;
  fields: ModelField[];
  templates: ModelTemplate[];
  css?: string;
  modelType?: number;
  latexPre?: string;
  latexPost?: string;
  sortFieldIndex?: number;
}

const DEFAULT_LATEX_PRE =
  "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n" +
  "\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n" +
  "\\begin{document}\n";
const DEFAULT_LATEX_POST = "\\end{document}";

const SENTINEL = "SeNtInEl";

export class Model {
  static readonly FRONT_BACK = 0;
  static readonly CLOZE = 1;
  static readonly DEFAULT_LATEX_PRE = DEFAULT_LATEX_PRE;
  static readonly DEFAULT_LATEX_POST = DEFAULT_LATEX_POST;

  modelId: number;
  name: string;
  css: string;
  modelType: number;
  latexPre: string;
  latexPost: string;
  sortFieldIndex: number;

  #fields: ModelField[] = [];
  #templates: ModelTemplate[] = [];
  #req: RequiredFields[] | undefined;

  constructor(options: ModelOptions) {
    assertSafeInteger(options.modelId, "Model modelId");
    this.modelId = options.modelId;
    this.name = options.name;
    this.fields = options.fields;
    this.templates = options.templates;
    this.css = options.css ?? "";
    this.modelType = options.modelType ?? Model.FRONT_BACK;
    this.latexPre = options.latexPre ?? DEFAULT_LATEX_PRE;
    this.latexPost = options.latexPost ?? DEFAULT_LATEX_POST;
    this.sortFieldIndex = options.sortFieldIndex ?? 0;
  }

  get fields(): ModelField[] {
    return this.#fields;
  }

  set fields(fields: ModelField[]) {
    this.#fields = fields;
    this.#req = undefined;
  }

  get templates(): ModelTemplate[] {
    return this.#templates;
  }

  set templates(templates: ModelTemplate[]) {
    this.#templates = templates;
    this.#req = undefined;
  }

  /**
   * Required fields for each template. Cached, and reset when fields or
   * templates are reassigned (not when they are mutated in place).
   *
   * Partial reimplementation of Anki's own logic: a field is "required" when
   * leaving it empty (and filling all the others) leaves no field content in
   * the rendered question. If no field is individually required, the template
   * needs "any" of the fields that make content appear.
   */
  get req(): RequiredFields[] {
    this.#req ??= this.#computeReq();
    return this.#req;
  }

  #computeReq(): RequiredFields[] {
    const fieldNames = this.#fields.map((field) => field.name);
    const filled = (overrides: Record<string, string>, fill: string) =>
      Object.fromEntries(fieldNames.map((name) => [name, overrides[name] ?? fill]));

    const req: RequiredFields[] = [];
    for (const [templateOrd, template] of this.#templates.entries()) {
      const required: number[] = [];
      for (const [fieldOrd, fieldName] of fieldNames.entries()) {
        const view = filled({ [fieldName]: "" }, SENTINEL);
        if (!render(template.qfmt, view).includes(SENTINEL)) {
          // Without this field the question has no content, so it is required.
          required.push(fieldOrd);
        }
      }
      if (required.length > 0) {
        req.push([templateOrd, "all", required]);
        continue;
      }

      // No single required field: check which fields make content appear.
      for (const [fieldOrd, fieldName] of fieldNames.entries()) {
        const view = filled({ [fieldName]: SENTINEL }, "");
        if (render(template.qfmt, view).includes(SENTINEL)) {
          required.push(fieldOrd);
        }
      }
      if (required.length === 0) {
        throw new Error(
          `Could not compute required fields for this template; please check the formatting of "qfmt": ${JSON.stringify(template)}`,
        );
      }
      req.push([templateOrd, "any", required]);
    }
    return req;
  }

  /** The model as stored in the `models` column of the `col` table. */
  toAnkiJson(timestamp: number, deckId: number): Record<string, unknown> {
    const tmpls = this.#templates.map((template, ord) => ({
      ...template,
      ord,
      bafmt: template.bafmt ?? "",
      bqfmt: template.bqfmt ?? "",
      bfont: template.bfont ?? "",
      bsize: template.bsize ?? 0,
      did: template.did ?? null,
    }));
    const flds = this.#fields.map((field, ord) => ({
      ...field,
      ord,
      font: field.font ?? "Liberation Sans",
      media: field.media ?? [],
      rtl: field.rtl ?? false,
      size: field.size ?? 20,
      sticky: field.sticky ?? false,
    }));

    return {
      css: this.css,
      did: deckId,
      flds,
      id: String(this.modelId),
      latexPost: this.latexPost,
      latexPre: this.latexPre,
      latexsvg: false,
      mod: Math.trunc(timestamp),
      name: this.name,
      req: this.req,
      sortf: this.sortFieldIndex,
      tags: [],
      tmpls,
      type: this.modelType,
      usn: -1,
      vers: [],
    };
  }
}
