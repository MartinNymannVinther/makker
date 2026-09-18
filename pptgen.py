"""
PowerPoint ud af chatten.

Samme princip som docgen.py:

    Modellen skriver.  Skabelonen former.

Men med en vigtig forskel. Et Word-dokument kan blive så langt det vil —
løber teksten over, får man bare flere sider. Et slide har en fast ramme,
og modeller skriver konsekvent for meget til den. Derfor er der hårde
grænser her (MAX_PUNKTER, MAX_TEGN), og de håndhæves i koden — ikke kun i
prompten. En model der ikke lytter, skal ikke kunne ødelægge et slide.

Skabelonen er en rigtig .pptx. Vi åbner AKA's egen fil og bruger dens
layouts, så alle slides arver skrifter, farver, logo og masteropsætning
uden at det står beskrevet i kode ét eneste sted.

Skift skabelon: læg en ny .pptx i templates/ og tilføj en Skabelon nederst.
"""
import io
import math
import datetime

from pptx import Presentation
from pptx.util import Pt

import docgen


# Så mange punkter og så mange tegn pr. punkt kan der stå på et slide i
# AKA-skabelonen uden at det løber ud over kanten. Tallene er fundet ved at
# rendere og kigge — ikke gættet.
MAX_PUNKTER = 6
MAX_TEGN = 110
MAX_OVERSKRIFT = 70
MAX_SLIDES = 20

# python-pptx kan ikke måle tekst — der er ingen skriftmotor med. Vi regner
# derfor selv: et tegn fylder i gennemsnit omkring halvdelen af
# skriftstørrelsen i bredden (holder for Calibri), og en linje fylder 1,22
# gange størrelsen i højden. Groft, men det er nok til at holde teksten
# inde i rammen, og det er hele formålet.
TEGNBREDDE = 0.5
LINJEHØJDE = 1.22
EMU_PR_PT = 12700


# --- Kontrakten med modellen ---------------------------------------------

SKEMA = """{
  "titel": "kort titel til forsiden",
  "undertitel": "afsender eller oplægsholder, fx \\"Ydelsesafdelingen\\"",
  "slides": [
    {
      "type": "emne",
      "overskrift": "kort sætning der introducerer et nyt afsnit"
    },
    {
      "type": "punkter",
      "overskrift": "sidens overskrift",
      "punkter": ["kort punkt", "kort punkt"],
      "noter": "det du ville sige mundtligt til dette slide"
    },
    {
      "type": "citat",
      "citat": "en central sætning der fortjener sit eget slide",
      "kilde": "hvem eller hvad den kommer fra"
    }
  ]
}"""

INSTRUKS = (
    "Du skal omsætte svaret ovenfor til et slidedeck.\n\n"
    "Svar KUN med JSON i præcis denne form — ingen forklaring, "
    "ingen markdown-kodeblok:\n\n" + SKEMA + "\n\n"
    "Regler:\n"
    "- Brug samme sprog som samtalen.\n"
    f"- Højst {MAX_PUNKTER} punkter pr. slide, og højst {MAX_TEGN} tegn "
    "i hvert punkt. Et slide er ikke et dokument — skriv stikord, ikke "
    "hele sætninger.\n"
    "- Læg det uddybende i \"noter\". Det er der, det hører hjemme.\n"
    "- Ingen markdown-tegn som ** eller # inde i teksterne.\n"
    "- Brug \"emne\" til at dele oplægget op, og \"citat\" hvor en enkelt "
    "pointe skal stå alene. Varier — ikke alle slides skal være punkter.\n"
    f"- Lav {MAX_SLIDES} slides eller færre. Typisk 6-12."
)


# --- Skabelonen ----------------------------------------------------------
# Alt det skabelonspecifikke står her: hvilke layouts der findes, og hvilken
# placeholder der skal have hvad. Vil man bruge en anden .pptx, er det disse
# tal og navne man retter — ikke koden nedenunder.

class Skabelon:
    def __init__(self, navn, grundfil, layouts, felter, afsender=""):
        self.navn = navn
        self.grundfil = grundfil
        self.layouts = layouts     # slidetype → layoutnavn i .pptx-filen
        self.felter = felter       # slidetype → felt → placeholder-idx
        self.afsender = afsender

    def præsentation(self):
        return Presentation(self.grundfil)

    def layout(self, prs, type_):
        """Find layoutet i skabelonen. Findes det ikke, tager vi det første
        der gør — så en skabelon uden fx citat-layout stadig kan bruges."""
        ønsket = self.layouts.get(type_)
        alle = list(prs.slide_masters[0].slide_layouts)
        for lay in alle:
            if lay.name == ønsket:
                return lay
        for reserve in (self.layouts.get("punkter"), self.layouts.get("emne")):
            for lay in alle:
                if lay.name == reserve:
                    return lay
        return alle[0]


AKA = Skabelon(
    navn="AKA",
    grundfil="templates/aka.pptx",
    afsender="Akademikernes A-kasse",
    layouts={
        "forside": "Intro Slide",
        "emne":    "Emne Slide Mørk",
        "punkter": "1_Tekst Slide + Billede",
        "citat":   "Citat Slide Lys",
    },
    # (placeholder-idx, skabelonens egen skriftstørrelse, mindste tilladte).
    # Numrene og størrelserne er læst ud af skabelonen. Bemærk at forsiden
    # har overskriften i 11 og oplægsholderen i 10 — ikke omvendt.
    felter={
        "forside": {"titel": (11, 60, 26), "under": (10, 18, 14)},
        "emne":    {"tekst": (11, 40, 22)},
        "punkter": {"titel": (0, 40, 22), "krop": (11, 18, 12)},
        "citat":   {"citat": (11, 40, 22), "kilde": (12, 14, 12)},
    },
)

SKABELONER = {"aka": AKA}
STANDARD = "aka"


# --- Fra modelsvar til indhold -------------------------------------------

TYPER = ("emne", "punkter", "citat")


def afkort(tekst: str, grænse: int = MAX_TEGN) -> str:
    """Klip et for langt punkt af ved nærmeste mellemrum."""
    tekst = tekst.strip()
    if len(tekst) <= grænse:
        return tekst
    klippet = tekst[:grænse].rsplit(" ", 1)[0]
    return (klippet or tekst[:grænse]).rstrip(" ,.;:") + " …"


def læs_svar(rå: str) -> dict:
    """Modelsvar → det et deck har brug for, med grænserne håndhævet."""
    data = docgen.json_fra_svar(rå)

    slides = []
    for rå_slide in (data.get("slides") or [])[:MAX_SLIDES]:
        if not isinstance(rå_slide, dict):
            continue
        type_ = docgen.tekstfelt(rå_slide.get("type")).lower()
        if type_ not in TYPER:
            type_ = "punkter"

        punkter = [afkort(p) for p in docgen.liste(rå_slide.get("punkter"))]
        slide = {
            "type": type_,
            "overskrift": afkort(docgen.tekstfelt(rå_slide.get("overskrift")),
                                 MAX_OVERSKRIFT),
            "punkter": punkter[:MAX_PUNKTER],
            "citat": docgen.tekstfelt(rå_slide.get("citat")),
            "kilde": docgen.tekstfelt(rå_slide.get("kilde")),
            "noter": docgen.tekstfelt(rå_slide.get("noter")),
        }

        # Det der ikke kunne være på slidet, går ikke tabt — det ryger i noterne.
        overskydende = punkter[MAX_PUNKTER:]
        if overskydende:
            slide["noter"] = (slide["noter"] + "\n\nUdeladt fra slidet:\n"
                              + "\n".join("- " + p for p in overskydende)).strip()

        if type_ == "punkter" and not slide["punkter"] and not slide["overskrift"]:
            continue
        slides.append(slide)

    return {
        "titel": docgen.tekstfelt(data.get("titel")) or "Oplæg",
        "undertitel": docgen.tekstfelt(data.get("undertitel")),
        "slides": slides,
    }


# --- Fra indhold til .pptx -----------------------------------------------

def _passer(linjer, størrelse, bredde_pt, højde_pt) -> bool:
    pr_linje = max(1, int(bredde_pt / (størrelse * TEGNBREDDE)))
    brugte = sum(max(1, math.ceil(len(l) / pr_linje)) for l in linjer)
    return brugte * størrelse * LINJEHØJDE <= højde_pt


def _vælg_størrelse(placeholder, linjer, maks_pt, min_pt):
    """Største skriftstørrelse hvor teksten stadig er inden for rammen.

    Rammen læses fra selve placeholderen, så tallene følger skabelonen —
    skifter man .pptx-fil, regner det stadig rigtigt.
    """
    bredde = placeholder.width / EMU_PR_PT
    højde = placeholder.height / EMU_PR_PT
    størrelse = maks_pt
    while størrelse > min_pt and not _passer(linjer, størrelse, bredde, højde):
        størrelse -= 2
    return størrelse


def _skriv(placeholder, linjer, maks_pt=None, min_pt=14):
    """Læg tekst i en placeholder uden at ødelægge skabelonens formatering.

    Vi sætter aldrig text_frame.text — det fjerner afsnittets typografi.
    I stedet genbruges det første afsnit, og resten tilføjes, så hvert
    afsnit arver punktopstilling, skrift og farve fra layoutet.

    Er maks_pt sat, skrumper skriften indtil teksten passer. Passer den i
    forvejen, rører vi den ikke — så beholder korte overskrifter præcis den
    størrelse skabelonen har valgt.
    """
    if isinstance(linjer, str):
        linjer = [linjer]
    linjer = [l for l in linjer if l]
    if not linjer:
        return

    tf = placeholder.text_frame
    tf.word_wrap = True
    tf.clear()                       # efterlader ét tomt afsnit
    for nr, linje in enumerate(linjer):
        afsnit = tf.paragraphs[0] if nr == 0 else tf.add_paragraph()
        afsnit.text = linje

    if not maks_pt:
        return
    valgt = _vælg_størrelse(placeholder, linjer, maks_pt, min_pt)
    if valgt >= maks_pt:
        return                       # passer som den er — lad skabelonen bestemme
    for afsnit in tf.paragraphs:
        for løb in afsnit.runs:
            løb.font.size = Pt(valgt)


def _fjern(placeholder):
    """Tag en ubrugt placeholder ud, så skabelonens hjælpetekst ikke bliver
    stående på slidet ("Klik på ikonet og indsæt billede")."""
    el = placeholder._element
    el.getparent().remove(el)


def _slide(prs, skabelon, type_):
    return prs.slides.add_slide(skabelon.layout(prs, type_))


def _udfyld(slide, felter, indhold):
    """Fyld de placeholders vi har indhold til, og fjern resten."""
    brugt = set()
    for felt, (idx, maks_pt, min_pt) in felter.items():
        tekst = indhold.get(felt)
        if not tekst:
            continue
        for ph in slide.placeholders:
            if ph.placeholder_format.idx == idx:
                _skriv(ph, tekst, maks_pt, min_pt)
                brugt.add(idx)
                break

    for ph in list(slide.placeholders):
        if ph.placeholder_format.idx not in brugt:
            _fjern(ph)


def byg(indhold: dict, skabelon: Skabelon = AKA, dato=None) -> bytes:
    """Struktureret indhold ind, færdig .pptx ud."""
    prs = skabelon.præsentation()

    # Forside
    forside = _slide(prs, skabelon, "forside")
    under = indhold["undertitel"] or skabelon.afsender
    dato = docgen.dansk_dato(dato or datetime.date.today())
    _udfyld(forside, skabelon.felter["forside"], {
        "titel": indhold["titel"],
        "under": f"{under} · {dato}" if under else dato,
    })

    for s in indhold["slides"]:
        slide = _slide(prs, skabelon, s["type"])

        if s["type"] == "emne":
            _udfyld(slide, skabelon.felter["emne"],
                    {"tekst": s["overskrift"] or s["citat"]})
        elif s["type"] == "citat":
            _udfyld(slide, skabelon.felter["citat"],
                    {"citat": s["citat"] or s["overskrift"], "kilde": s["kilde"]})
        else:
            _udfyld(slide, skabelon.felter["punkter"],
                    {"titel": s["overskrift"], "krop": s["punkter"]})

        if s["noter"]:
            slide.notes_slide.notes_text_frame.text = s["noter"]

    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()


def filnavn(titel: str) -> str:
    return docgen.filnavn(titel).replace(".docx", ".pptx")
