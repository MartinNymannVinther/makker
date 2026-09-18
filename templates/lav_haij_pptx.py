"""
Bygger templates/haij.pptx — Haij-familiens PowerPoint-skabelon.

Kør:  .venv/bin/python templates/lav_haij_pptx.py

Skabelonen laves ud fra python-pptx' indbyggede standard, som er 4:3 og
hvid Calibri. Her gøres den 16:9, får Haij's farver (varmt papir, mosgrøn)
og mærket i hjørnet, og de fire layouts pptgen bruger får nye navne og
placeringer. Filen er checket ind, så pptgen ikke er afhængig af scriptet
ved kørsel — scriptet er her så skabelonen kan genskabes og rettes uden
PowerPoint. Ret her, kør, og commit den nye .pptx.

Skrift: Arial. Archivo er ikke på modtagerens maskine, og Arial er den
metriske erstatning Haij alligevel falder tilbage på i webappen.
"""
import pathlib

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR
from pptx.oxml.xmlchemy import OxmlElement
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

HER = pathlib.Path(__file__).parent
UD = HER / "haij.pptx"

# Haij-tokens (hex-værdierne fra familiens globals.css).
PAPIR = RGBColor(0xF7, 0xF5, 0xF1)
KORT = RGBColor(0xFF, 0xFD, 0xFA)
TEKST = RGBColor(0x24, 0x22, 0x1E)
META = RGBColor(0x8A, 0x84, 0x79)
MOS = RGBColor(0x4A, 0x6B, 0x53)
MOS_LYS = RGBColor(0x7A, 0x9A, 0x80)
SAND = RGBColor(0xC9, 0xC2, 0xB6)
LINJE = RGBColor(0xEA, 0xE5, 0xDC)

SKRIFT = "Arial"
BREDDE, HØJDE = Inches(13.333), Inches(7.5)
MARGEN = Inches(0.8)


def _fyld(shape, farve):
    shape.fill.solid()
    shape.fill.fore_color.rgb = farve


def _baggrund(slide_eller_layout, farve):
    fill = slide_eller_layout.background.fill
    fill.solid()
    fill.fore_color.rgb = farve


class _Tegner:
    """python-pptx kan ikke tegne figurer direkte på et layout. Vi tegner
    dem på et kladdeslide og flytter XML-elementet over i layoutets
    figurtræ. Kladdesliden fjernes til sidst."""

    def __init__(self, prs):
        self.prs = prs
        self.kladde = prs.slides.add_slide(prs.slide_layouts[6])   # Blank

    def figur(self, layout, x, y, w, h, farve, rundet=None):
        # Autoshape 5 = rundet rektangel, 1 = rektangel.
        f = self.kladde.shapes.add_shape(5 if rundet else 1, int(x), int(y),
                                         int(w), int(h))
        f.line.fill.background()
        _fyld(f, farve)
        if rundet:
            f.adjustments[0] = rundet
        layout.shapes._spTree.append(f._element)
        return f

    def mærke(self, layout, x, y, bredde=Inches(0.55),
              farver=(MOS, MOS_LYS, SAND)):
        """Haij-mærket: tre venstrestillede bjælker, lang-kort-mellem."""
        fra_svg = bredde / 38          # SVG'en er 38 bred og 34 høj
        for (sy, w), farve in zip(((0, 38), (13, 25), (26, 31)), farver):
            self.figur(layout, x, y + sy * fra_svg, w * fra_svg, 8 * fra_svg,
                       farve, rundet=0.3)

    def ryd_op(self):
        sldIdLst = self.prs.slides._sldIdLst
        sldId = sldIdLst[-1]
        self.prs.part.drop_rel(sldId.rId)
        sldIdLst.remove(sldId)


def _typografi(ph, størrelse, farve, fed=False, justering="l", anker=None,
               linjeafstand=None, punkttegn=False):
    """Standard-tekstegenskaber på en layout-placeholder.

    Slides arver ikke fra layoutets afsnit, kun fra dets lstStyle. Derfor
    skrives egenskaberne som lvl1pPr/defRPr i XML — python-pptx har ingen
    API til det. Punktopstillingens dybere niveauer arver fra lvl1.
    """
    tf = ph.text_frame
    tf.word_wrap = True
    if anker is not None:
        tf.vertical_anchor = anker

    txBody = ph._element.txBody
    lstStyle = txBody.find(qn("a:lstStyle"))
    if lstStyle is None:
        lstStyle = OxmlElement("a:lstStyle")
        txBody.insert(1, lstStyle)          # efter bodyPr
    for gammel in list(lstStyle):
        lstStyle.remove(gammel)

    lvl = OxmlElement("a:lvl1pPr")
    lvl.set("algn", justering)
    if linjeafstand:
        lnSpc = OxmlElement("a:lnSpc")
        pct = OxmlElement("a:spcPct")
        pct.set("val", str(int(linjeafstand * 100000)))
        lnSpc.append(pct)
        lvl.append(lnSpc)
    if not punkttegn:
        lvl.append(OxmlElement("a:buNone"))
    defRPr = OxmlElement("a:defRPr")
    defRPr.set("sz", str(int(størrelse * 100)))
    defRPr.set("b", "1" if fed else "0")
    fill = OxmlElement("a:solidFill")
    clr = OxmlElement("a:srgbClr")
    clr.set("val", str(farve))
    fill.append(clr)
    defRPr.append(fill)
    latin = OxmlElement("a:latin")
    latin.set("typeface", SKRIFT)
    defRPr.append(latin)
    lvl.append(defRPr)
    lstStyle.append(lvl)

    # Layoutets egen eksempeltekst skal også se rigtig ud i PowerPoint.
    for afsnit in tf.paragraphs:
        for løb in afsnit.runs:
            løb.font.name = SKRIFT
            løb.font.size = Pt(størrelse)
            løb.font.bold = fed
            løb.font.color.rgb = farve


def _placer(ph, x, y, w, h):
    ph.left, ph.top, ph.width, ph.height = int(x), int(y), int(w), int(h)


def _placeholder(layout, idx):
    for ph in layout.placeholders:
        if ph.placeholder_format.idx == idx:
            return ph
    raise KeyError(idx)


def _fjern_placeholder(layout, idx):
    el = _placeholder(layout, idx)._element
    el.getparent().remove(el)


def _layout(prs, navn):
    for lay in prs.slide_masters[0].slide_layouts:
        if lay.name == navn:
            return lay
    raise KeyError(navn)


def byg():
    prs = Presentation()
    prs.slide_width, prs.slide_height = BREDDE, HØJDE

    master = prs.slide_masters[0]
    _baggrund(master, PAPIR)
    tegn = _Tegner(prs)
    # Dato, sidefod og sidetal fra standarden fjernes; de ville stå med
    # 4:3-placeringer og hjælpetekst. pptgen sætter selv det der skal stå.
    for ph in list(master.placeholders):
        if ph.placeholder_format.idx >= 10:
            el = ph._element
            el.getparent().remove(el)

    # --- Forside ----------------------------------------------------------
    lay = _layout(prs, "Title Slide")
    lay.name = "Forside"
    _baggrund(lay, PAPIR)
    tegn.mærke(lay, MARGEN, MARGEN, bredde=Inches(0.9))
    titel = _placeholder(lay, 0)
    _placer(titel, MARGEN, Inches(2.6), BREDDE - 2 * MARGEN, Inches(2.2))
    _typografi(titel, 48, TEKST, fed=True, justering="l",
               anker=MSO_ANCHOR.BOTTOM)
    under = _placeholder(lay, 1)
    _placer(under, MARGEN, Inches(4.95), BREDDE - 2 * MARGEN, Inches(0.9))
    _typografi(under, 18, META, justering="l", anker=MSO_ANCHOR.TOP)
    _fjern_dato_fod(lay)

    # --- Emne: mosgrøn side der deler oplægget op ---------------------------
    lay = _layout(prs, "Section Header")
    lay.name = "Emne"
    _baggrund(lay, MOS)
    tegn.mærke(lay, MARGEN, MARGEN,
               farver=(PAPIR, RGBColor(0xC8, 0xD8, 0xCB), MOS_LYS))
    tekst = _placeholder(lay, 0)
    _placer(tekst, MARGEN, Inches(2.4), BREDDE - 2 * MARGEN, Inches(2.6))
    _typografi(tekst, 40, PAPIR, fed=True, justering="l",
               anker=MSO_ANCHOR.MIDDLE)
    _fjern_placeholder(lay, 1)
    _fjern_dato_fod(lay)

    # --- Punkter -----------------------------------------------------------
    lay = _layout(prs, "Title and Content")
    lay.name = "Punkter"
    _baggrund(lay, PAPIR)
    tegn.mærke(lay, BREDDE - MARGEN - Inches(0.4), HØJDE - MARGEN - Inches(0.36),
               bredde=Inches(0.4))
    titel = _placeholder(lay, 0)
    _placer(titel, MARGEN, Inches(0.6), BREDDE - 2 * MARGEN, Inches(1.1))
    _typografi(titel, 32, TEKST, fed=True, justering="l",
               anker=MSO_ANCHOR.BOTTOM)
    krop = _placeholder(lay, 1)
    _placer(krop, MARGEN, Inches(2.0), BREDDE - 2 * MARGEN, Inches(4.5))
    _typografi(krop, 20, TEKST, anker=MSO_ANCHOR.TOP, linjeafstand=1.15,
               punkttegn=True)
    # Punkttegnet arver farven fra teksten; tynd streg under titlen.
    tegn.figur(lay, MARGEN, Inches(1.8), BREDDE - 2 * MARGEN, Pt(1.5), MOS)
    _fjern_dato_fod(lay)

    # --- Citat: én sætning alene ------------------------------------------
    lay = _layout(prs, "Picture with Caption")
    lay.name = "Citat"
    _baggrund(lay, KORT)
    _fjern_placeholder(lay, 1)              # billedfeltet
    tegn.mærke(lay, MARGEN, MARGEN, bredde=Inches(0.55))
    citat = _placeholder(lay, 0)
    _placer(citat, Inches(1.6), Inches(2.0), BREDDE - Inches(3.2), Inches(3.0))
    _typografi(citat, 32, MOS, justering="l", anker=MSO_ANCHOR.MIDDLE,
               linjeafstand=1.2)
    kilde = _placeholder(lay, 2)
    _placer(kilde, Inches(1.6), Inches(5.2), BREDDE - Inches(3.2), Inches(0.7))
    _typografi(kilde, 16, META, justering="l", anker=MSO_ANCHOR.TOP)
    _fjern_dato_fod(lay)

    tegn.ryd_op()
    prs.save(UD)
    return UD


def _fjern_dato_fod(layout):
    for ph in list(layout.placeholders):
        if ph.placeholder_format.idx >= 10:
            el = ph._element
            el.getparent().remove(el)


if __name__ == "__main__":
    print("skrev", byg())
