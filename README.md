# @yukasama/genanki-ts

TypeScript-Port von [genanki](https://github.com/kerrickstaley/genanki) 0.13.1
(MIT, © Kerrick Staley): erzeugt Anki-Decks (`.apkg`) programmatisch.

Keine Runtime-Dependencies: SQLite kommt aus `node:sqlite`, `zlib` aus Node,
den Zip-Writer (`src/zip.ts`) und den Mustache-Renderer (`src/mustache.ts`)
gibt es hier selbst. Benötigt Node >= 26.

## Nutzung

```ts
import { CLOZE_MODEL, Deck, Model, Note, Package } from "@yukasama/genanki-ts";

const model = new Model({
  modelId: 1607392319,
  name: "Docuvalley Basic",
  fields: [{ name: "Front" }, { name: "Back" }],
  templates: [{ name: "Card 1", qfmt: "{{Front}}", afmt: '{{FrontSide}}<hr id="answer">{{Back}}' }],
});

const deck = new Deck(2059400110, "Mein Deck");
deck.addNote(new Note({ model, fields: ["Frage", "Antwort"], tags: ["bio"] }));

const pkg = new Package(deck, [
  "/pfad/zu/bild.png", // Pfad: wird unter dem Basename abgelegt
  { name: "audio.mp3", data: bytes }, // oder Bytes im Speicher
]);
const apkg: Buffer = await pkg.toBuffer(); // oder: await pkg.writeToFile("deck.apkg")
```

`toBuffer(timestamp?)` / `writeToFile(file, timestamp?)` nehmen optional einen
festen Timestamp (Sekunden), dann ist die Ausgabe byte-identisch reproduzierbar.

## Unterschiede zu Python-genanki

- Konstruktoren von `Model` und `Note` nehmen ein Options-Objekt (`modelId`,
  `sortField`, `modelType`, …); `Deck(deckId, name, description?)` und
  `Package(deckOrDecks, mediaFiles?)` bleiben positional.
- Ids (`modelId`, `deckId`) müssen sichere Integer sein (< 2^53).
- Fehlt: `fields`/`templates` als YAML-String und
  `write_to_collection_from_addon` (nur innerhalb von Anki-Add-ons nutzbar).
- Zusätzlich: Medien als Bytes, `toBuffer()` (kein Temp-Verzeichnis nötig).
- `.apkg`-Einträge sind deflate-komprimiert (Python: unkomprimiert).
- Cloze-Note ohne `{{cN::…}}` bekommt eine Karte (Ord 0). Python-genanki
  vergleicht `set == {}` (nie wahr) und erzeugt dort gar keine Karte.
- `guidFor` stringifiziert mit `String()`; für Strings/Ints identisch mit
  Python, bei Floats/Bool/None nicht.
- Warnungen (ungültiges HTML, veraltetes einfeldriges `CLOZE_MODEL`) laufen
  über `process.emitWarning` statt Pythons `warnings`.

## Tests

`pnpm test`. `test/parity.spec.ts` vergleicht alle Zeilen der `notes`/`cards`-
Tabellen und alle JSON-Blobs der `col`-Tabelle mit einem Golden File, das
Python-genanki 0.13.1 erzeugt hat.