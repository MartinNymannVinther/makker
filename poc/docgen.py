"""
Word-dokumenter ud af chatten.

Princippet — og hele grunden til at filen findes:

    Modellen skriver.  Skabelonen former.

Modellen laver ikke en Word-fil. Den leverer struktureret indhold (JSON
efter SKEMA herunder), og koden her hælder det ind i en skabelon. Så ser
alle dokumenter ens ud, uanset hvad modellen finder på, og et nyt design
er en ny Skabelon — ikke en ny prompt.

Skift skabelon: tilføj en Skabelon i SKABELONER nederst.
"""
import io
import re
import json
import datetime

from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# --- Kontrakten med modellen ---------------------------------------------
# Holder vi den lille, rammer modellen den hver gang. Vil du have flere
# elementer (tabeller, citater, bilag), udvider du SKEMA her *og* giver
# _brødtekst() noget at gøre med dem.

SKEMA = """{
  "titel": "kort, præcis dokumenttitel",
  "undertitel": "én linje der uddyber titlen, eller \\"\\"",
  "resume": "2-4 sætninger der opsummerer dokumentet, eller \\"\\"",
  "sektioner": [
    {
      "overskrift": "sektionens overskrift",
      "afsnit": ["brødtekst som hele afsnit", "..."],
      "punkter": ["eventuelle punkter i punktopstilling"]
    }
  ]
}"""

INSTRUKS = (
    "Du skal omsætte svaret ovenfor til et struktureret dokument.\n\n"
    "Svar KUN med JSON i præcis denne form — ingen forklaring, "
    "ingen markdown-kodeblok:\n\n" + SKEMA + "\n\n"
    "Regler:\n"
    "- Brug samme sprog som samtalen.\n"
    "- Skriv hele, færdige sætninger i \"afsnit\". Ingen markdown-tegn "
    "som ** eller # inde i teksterne.\n"
    "- \"punkter\" må være en tom liste hvis sektionen ikke har punkter.\n"
    "- Del stoffet i 2-6 sektioner."
)

MÅNEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli",
           "august", "september", "oktober", "november", "december"]


def dansk_dato(d: datetime.date) -> str:
    return f"{d.day}. {MÅNEDER[d.month - 1]} {d.year}"


# --- Skabelonen ----------------------------------------------------------
# Alt det visuelle står ét sted. Vil man have et andet udtryk, laver man en
# ny Skabelon — koden nedenunder er den samme.

class Skabelon:
    def __init__(self, navn, afsender, accent, skrift="Calibri",
                 grundstørrelse=11, forside=True, grundfil=None):
        self.navn = navn
        self.afsender = afsender          # står på forsiden og i sidefoden
        self.accent = accent              # (r, g, b)
        self.skrift = skrift
        self.grundstørrelse = grundstørrelse
        self.forside = forside
        # Peger man grundfil på en rigtig .docx fra designafdelingen, arver
        # dokumentet dens typografier, logo og opsætning. Så er det den fil
        # man skifter ud — ikke koden her.
        self.grundfil = grundfil

    @property
    def farve(self):
        return RGBColor(*self.accent)

    def nyt_dokument(self):
        return Document(self.grundfil) if self.grundfil else Document()

    # -- typografier ------------------------------------------------------
    def opsæt(self, doc):
        normal = doc.styles["Normal"]
        normal.font.name = self.skrift
        normal.font.size = Pt(self.grundstørrelse)
        normal.paragraph_format.space_after = Pt(8)
        normal.paragraph_format.line_spacing = 1.15

        for niveau, størrelse in ((1, 15), (2, 12)):
            stil = doc.styles[f"Heading {niveau}"]
            stil.font.name = self.skrift
            stil.font.size = Pt(størrelse)
            stil.font.bold = True
            stil.font.color.rgb = self.farve
            stil.paragraph_format.space_before = Pt(16 if niveau == 1 else 12)
            stil.paragraph_format.space_after = Pt(4)

    # -- forside ----------------------------------------------------------
    def tegn_forside(self, doc, indhold, dato):
        if not self.forside:
            return

        doc.add_paragraph()  # luft ned til titlen
        doc.add_paragraph()

        afsender = doc.add_paragraph()
        løb = afsender.add_run(self.afsender.upper())
        løb.font.size = Pt(10)
        løb.font.bold = True
        løb.font.color.rgb = self.farve

        titel = doc.add_paragraph()
        titel.paragraph_format.space_before = Pt(6)
        løb = titel.add_run(indhold["titel"])
        løb.font.size = Pt(28)
        løb.font.bold = True

        if indhold["undertitel"]:
            under = doc.add_paragraph()
            løb = under.add_run(indhold["undertitel"])
            løb.font.size = Pt(13)
            løb.font.color.rgb = RGBColor(0x60, 0x60, 0x60)

        linje = doc.add_paragraph()
        linje.paragraph_format.space_before = Pt(18)
        løb = linje.add_run(dato)
        løb.font.size = Pt(10)
        løb.font.color.rgb = RGBColor(0x60, 0x60, 0x60)

        doc.add_page_break()

    # -- sidefod ----------------------------------------------------------
    def tegn_sidefod(self, doc):
        fod = doc.sections[0].footer.paragraphs[0]
        fod.alignment = WD_ALIGN_PARAGRAPH.CENTER
        løb = fod.add_run(f"{self.afsender}  ·  side ")
        løb.font.size = Pt(8)
        løb.font.color.rgb = RGBColor(0x80, 0x80, 0x80)
        _sidetal(fod)


def _sidetal(afsnit):
    """Indsætter Words PAGE-felt, så sidetallet opdaterer sig selv."""
    løb = afsnit.add_run()
    løb.font.size = Pt(8)
    løb.font.color.rgb = RGBColor(0x80, 0x80, 0x80)
    start = OxmlElement("w:fldChar")
    start.set(qn("w:fldCharType"), "begin")
    kode = OxmlElement("w:instrText")
    kode.set(qn("xml:space"), "preserve")
    kode.text = "PAGE"
    slut = OxmlElement("w:fldChar")
    slut.set(qn("w:fldCharType"), "end")
    for element in (start, kode, slut):
        løb._r.append(element)


HAIJ = Skabelon(
    navn="Haij",
    afsender="Haij",
    accent=(0x4A, 0x6B, 0x53),   # Haij's mosgrønne — samme som i chatfladen
    # Archivo er ikke installeret på modtagerens maskine, så vi bruger
    # Arial, som Archivo alligevel falder tilbage på i webappen.
    skrift="Arial",
)

# Flere skabeloner? Én linje her. UI'et behøver ikke vide mere.
SKABELONER = {"haij": HAIJ}
STANDARD = "haij"


# --- Fra modelsvar til dokument ------------------------------------------

def json_fra_svar(rå: str) -> dict:
    """Find JSON'en i et modelsvar.

    Modeller pakker gerne JSON ind i ```json-blokke eller lægger en høflig
    sætning foran. Vi klipper ind til første { og sidste }.

    Bruges også af pptgen — det er den samme slags rod uanset format.
    """
    tekst = (rå or "").strip()
    start, slut = tekst.find("{"), tekst.rfind("}")
    if start == -1 or slut == -1:
        raise ValueError("Modellen svarede ikke med JSON.")
    try:
        return json.loads(tekst[start:slut + 1])
    except json.JSONDecodeError as e:
        raise ValueError(f"Modellens JSON kunne ikke læses: {e}")


def tekstfelt(værdi):
    return værdi.strip() if isinstance(værdi, str) else ""


def liste(værdi):
    if not isinstance(værdi, list):
        return []
    return [x.strip() for x in værdi if isinstance(x, str) and x.strip()]


def læs_svar(rå: str) -> dict:
    """Modelsvar → indholdet et Word-dokument har brug for."""
    data = json_fra_svar(rå)

    sektioner = []
    for rå_sektion in data.get("sektioner") or []:
        if not isinstance(rå_sektion, dict):
            continue
        sektioner.append({
            "overskrift": tekstfelt(rå_sektion.get("overskrift")),
            "afsnit": liste(rå_sektion.get("afsnit")),
            "punkter": liste(rå_sektion.get("punkter")),
        })

    return {
        "titel": tekstfelt(data.get("titel")) or "Dokument",
        "undertitel": tekstfelt(data.get("undertitel")),
        "resume": tekstfelt(data.get("resume")),
        "sektioner": sektioner,
    }


def byg(indhold: dict, skabelon: Skabelon = HAIJ, dato=None) -> bytes:
    """Struktureret indhold ind, færdig .docx ud."""
    dato = dansk_dato(dato or datetime.date.today())

    doc = skabelon.nyt_dokument()
    skabelon.opsæt(doc)
    skabelon.tegn_sidefod(doc)
    skabelon.tegn_forside(doc, indhold, dato)

    if indhold["resume"]:
        doc.add_heading("Resumé", level=1)
        doc.add_paragraph(indhold["resume"])

    for sektion in indhold["sektioner"]:
        if sektion["overskrift"]:
            doc.add_heading(sektion["overskrift"], level=1)
        for afsnit in sektion["afsnit"]:
            doc.add_paragraph(afsnit)
        for punkt in sektion["punkter"]:
            doc.add_paragraph(punkt, style="List Bullet")

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def filnavn(titel: str) -> str:
    """"Årsrapport 2026" → "aarsrapport-2026.docx" — sikkert i alle browsere."""
    tekst = titel.lower()
    for fra, til in (("æ", "ae"), ("ø", "oe"), ("å", "aa")):
        tekst = tekst.replace(fra, til)
    tekst = re.sub(r"[^a-z0-9]+", "-", tekst).strip("-")
    return (tekst or "dokument")[:60] + ".docx"
