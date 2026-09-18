/**
 * Models that behave like Anki's built-in ones ("Basic", "Cloze", ...).
 *
 * Anki does not assign consistent ids to its built-in models, so importing a
 * model called plain "Basic" with a different id makes Anki rename it to
 * something like "Basic-123abc". Hence the "(genanki)" suffix.
 */
import { Model } from "./model.ts";

const CSS =
  ".card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}\n";

const FRONT_BACK_FIELDS = [
  { name: "Front", font: "Arial" },
  { name: "Back", font: "Arial" },
];

export const BASIC_MODEL = new Model({
  modelId: 1559383000,
  name: "Basic (genanki)",
  fields: FRONT_BACK_FIELDS.map((field) => ({ ...field })),
  templates: [
    {
      name: "Card 1",
      qfmt: "{{Front}}",
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
    },
  ],
  css: CSS,
});

export const BASIC_AND_REVERSED_CARD_MODEL = new Model({
  modelId: 1485830179,
  name: "Basic (and reversed card) (genanki)",
  fields: FRONT_BACK_FIELDS.map((field) => ({ ...field })),
  templates: [
    {
      name: "Card 1",
      qfmt: "{{Front}}",
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
    },
    {
      name: "Card 2",
      qfmt: "{{Back}}",
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
    },
  ],
  css: CSS,
});

export const BASIC_OPTIONAL_REVERSED_CARD_MODEL = new Model({
  modelId: 1382232460,
  name: "Basic (optional reversed card) (genanki)",
  fields: [...FRONT_BACK_FIELDS, { name: "Add Reverse", font: "Arial" }].map((field) => ({
    ...field,
  })),
  templates: [
    {
      name: "Card 1",
      qfmt: "{{Front}}",
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
    },
    {
      name: "Card 2",
      qfmt: "{{#Add Reverse}}{{Back}}{{/Add Reverse}}",
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
    },
  ],
  css: CSS,
});

export const BASIC_TYPE_IN_THE_ANSWER_MODEL = new Model({
  modelId: 1305534440,
  name: "Basic (type in the answer) (genanki)",
  fields: FRONT_BACK_FIELDS.map((field) => ({ ...field })),
  templates: [
    {
      name: "Card 1",
      qfmt: "{{Front}}\n\n{{type:Back}}",
      afmt: "{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}",
    },
  ],
  css: CSS,
});

export const CLOZE_MODEL = new Model({
  modelId: 1550428389,
  name: "Cloze (genanki)",
  modelType: Model.CLOZE,
  fields: [
    { name: "Text", font: "Arial" },
    { name: "Back Extra", font: "Arial" },
  ],
  templates: [
    {
      name: "Cloze",
      qfmt: "{{cloze:Text}}",
      afmt: "{{cloze:Text}}<br>\n{{Back Extra}}",
    },
  ],
  css:
    CSS +
    "\n.cloze {\n font-weight: bold;\n color: blue;\n}\n.nightMode .cloze {\n color: lightblue;\n}",
});
