import json, sqlite3, sys, zipfile, tempfile, os, warnings
warnings.simplefilter("ignore")
import genanki

TS = 1_700_000_000.5
basic = genanki.BASIC_MODEL
custom = genanki.Model(1607392319, "Docuvalley Basic",
    fields=[{"name": "Front"}, {"name": "Back"}],
    templates=[{"name": "Card 1", "qfmt": "{{Front}}", "afmt": '{{FrontSide}}<hr id="answer">{{Back}}'}])
cloze = genanki.Model(1607392320, "Docuvalley Cloze",
    fields=[{"name": "Text"}, {"name": "Extra"}],
    templates=[{"name": "Cloze Card", "qfmt": "{{cloze:Text}}", "afmt": '{{cloze:Text}}<hr id="answer">{{Extra}}'}],
    model_type=genanki.Model.CLOZE)

deck = genanki.Deck(123456789, "Parity Deck", "desc")
deck.add_note(genanki.Note(model=custom, fields=["Q1", "A1"], guid="g-1-basic"))
deck.add_note(genanki.Note(model=custom, fields=["Q2 <b>bold</b>", ""], tags=["a", "b"]))
deck.add_note(genanki.Note(model=cloze, fields=["{{c1::x}} and {{c3::y}} {{c1::z}}", "extra"], guid="g-cloze", due=5))
deck.add_note(genanki.Note(model=genanki.BASIC_AND_REVERSED_CARD_MODEL, fields=["F", "B"]))
deck.add_note(genanki.Note(model=genanki.BASIC_OPTIONAL_REVERSED_CARD_MODEL, fields=["F", "B", ""]))
deck.add_note(genanki.Note(model=genanki.BASIC_OPTIONAL_REVERSED_CARD_MODEL, fields=["F", "B", "y"]))
deck.add_note(genanki.Note(model=genanki.BASIC_TYPE_IN_THE_ANSWER_MODEL, fields=["F", "B"], sort_field="sortme"))
deck.add_note(genanki.Note(model=genanki.CLOZE_MODEL, fields=["{{c2::a}}", ""]))
deck2 = genanki.Deck(42, "Second")
deck2.add_note(genanki.Note(model=basic, fields=["ünï", "cödé"]))

media = os.path.join(tempfile.mkdtemp(), "pic.png")
open(media, "wb").write(b"\x89PNGfake")
pkg = genanki.Package([deck, deck2], media_files=[media])
out = tempfile.mktemp(suffix=".apkg")
pkg.write_to_file(out, timestamp=TS)

z = zipfile.ZipFile(out)
dbp = tempfile.mktemp()
open(dbp, "wb").write(z.read("collection.anki2"))
c = sqlite3.connect(dbp)
dump = {"names": sorted(z.namelist()), "media": json.loads(z.read("media")), "mediaData": z.read("0").hex()}
for t in ["notes", "cards"]:
    dump[t] = [list(r) for r in c.execute(f"select * from {t} order by id")]
col = list(c.execute("select * from col"))[0]
dump["col"] = [col[0:8]] + [json.loads(x) for x in col[8:]]
dump["col"][0] = list(dump["col"][0])
json.dump(dump, open(sys.argv[1], "w"), indent=1, sort_keys=True)
