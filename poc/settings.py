"""
Indstillinger man kan rette uden at røre koden.

Standardværdierne står herunder. Retter administrator noget i UI'et, gemmes
kun forskellen i settings.json — så nye indstillinger i en senere version
dukker op af sig selv i stedet for at blive overskrevet af en gammel fil.

Til en POC er en JSON-fil rigeligt. Skal det i drift med flere brugere,
er det her man lægger en database og en adgangskontrol foran.
"""
import json
import pathlib

FIL = pathlib.Path("settings.json")

STANDARD = {
    # Går forud for hver samtale. Ligger server-side med vilje: browseren
    # skal hverken kunne se eller ændre den uden om denne side.
    "system": (
        "Du er en hjælpsom assistent for en dansk virksomhed. "
        "Svar kort, klart og præcist på dansk."
    ),

    # Hvor langt et svar må blive. Word-dokumenter får deres eget, større loft.
    "max_tokens": 4096,

    # Hvilken model der laver billedprompter om til engelsk. Peg den på en
    # lokal model, hvis prompten ikke må forlade maskinen.
    "billedprompt_model": "Mistral Small",

    # --- Roller ----------------------------------------------------------
    # En rolle lægges oven på systemprompten for den enkelte chat. Den
    # erstatter den ikke — så sproget og rammen fra systemprompten gælder
    # stadig, uanset hvilken rolle man vælger.
    "roller": [
        {
            "id": "standard",
            "navn": "Assistent",
            "beskrivelse": "Hjælpsom og kortfattet. Standard.",
            "instruks": "",
        },
        {
            "id": "sparring",
            "navn": "Kreativ sparringspartner",
            "beskrivelse": "Mange vinkler, også de skæve. Vurderer ikke undervejs.",
            "instruks":
                "Du er sparringspartner, ikke facitliste. Giv mange "
                "forskellige vinkler på det brugeren bringer op — også dem "
                "der er skæve eller usandsynlige. Sortér ikke undervejs; få "
                "idéerne på bordet først, og lad brugeren vælge. Stil gerne "
                "spørgsmål tilbage. Vær kort i hvert forslag, hellere ti "
                "korte end tre lange.",
        },
        {
            "id": "modspil",
            "navn": "Djævlens advokat",
            "beskrivelse": "Indtager det modsatte synspunkt og udfordrer dig.",
            "instruks":
                "Indtag konsekvent det modsatte synspunkt af brugerens. "
                "Find de svageste led i ræsonnementet og pres på dem. Peg på "
                "det der er antaget uden at være undersøgt, og på hvad der "
                "sker hvis antagelsen ikke holder. Vær respektfuld, men ikke "
                "eftergivende — giv dig ikke bare fordi brugeren gentager "
                "sig. Slut hvert svar med det stærkeste modargument du har.",
        },
        {
            "id": "kritisk",
            "navn": "Kritisk læser",
            "beskrivelse": "Læser din tekst som en skeptisk modtager.",
            "instruks":
                "Læs brugerens tekst som den mest skeptiske modtager den kan "
                "få. Hvad er uklart, hvad kan misforstås, hvad mangler, og "
                "hvor vil læseren blive i tvivl eller irriteret? Vær konkret: "
                "citér det sted du mener, og foreslå hvad der kunne stå i "
                "stedet. Ros kun det der faktisk fortjener det.",
        },
        {
            "id": "sprog",
            "navn": "Sprogvasker",
            "beskrivelse": "Skriver om til klart dansk uden kancellisprog.",
            "instruks":
                "Skriv brugerens tekst om til klart dansk. Væk med "
                "kancellisprog, unødig passiv, lange indskudte sætninger og "
                "fagudtryk der kan siges enklere. Behold det faglige indhold "
                "præcist — forenkl sproget, ikke sagen. Vis den nye tekst "
                "først, og skriv derefter kort hvad du ændrede og hvorfor.",
        },
        {
            "id": "grundig",
            "navn": "Grundig læser",
            "beskrivelse": "Præcis, holder sig til materialet, siger fra.",
            "instruks":
                "Vær præcis og forsigtig. Hold dig til det der står i "
                "materialet, og skeln tydeligt mellem hvad der står, og hvad "
                "du udleder. Skriv det ligeud når grundlaget ikke rækker til "
                "et svar, i stedet for at gætte. Henvis til hvor i materialet "
                "du har det fra.",
        },
        {
            "id": "underviser",
            "navn": "Underviser",
            "beskrivelse": "Forklarer enkelt, som til en ny kollega.",
            "instruks":
                "Forklar som til en ny kollega på første uge. Start med det "
                "store billede, før du går i detaljer. Brug et konkret "
                "eksempel. Undgå fagudtryk, eller forklar dem første gang de "
                "bruges. Slut med at spørge om der er noget der skal "
                "uddybes.",
        },
    ],

    # --- Opgavebibliotek --------------------------------------------------
    # Færdige opgaver brugeren kan klikke på. "prompt" lægges i skrivefeltet,
    # og "rolle" sætter samtidig rollen, hvis opgaven har en der passer.
    "opgaver": [
        {"gruppe": "Skriv", "navn": "Svar på en henvendelse",
         "beskrivelse": "Venligt og præcist svar til en kunde eller kollega",
         "prompt": "Skriv et venligt og præcist svar på henvendelsen. "
                   "Henvendelsen er:\n\n",
         "rolle": ""},
        {"gruppe": "Skriv", "navn": "Skriv et notat",
         "beskrivelse": "Kort notat med overskrifter",
         "prompt": "Skriv et kort notat om følgende. Brug overskrifter og "
                   "hold det under en side:\n\n",
         "rolle": ""},
        {"gruppe": "Skriv", "navn": "Mødeindkaldelse",
         "beskrivelse": "Formål, dagsorden og forberedelse",
         "prompt": "Skriv en mødeindkaldelse med formål, dagsorden og hvad "
                   "deltagerne skal forberede. Mødet handler om:\n\n",
         "rolle": ""},
        {"gruppe": "Skriv", "navn": "Ret sproget igennem",
         "beskrivelse": "Om til klart dansk",
         "prompt": "Skriv teksten herunder om til klart dansk:\n\n",
         "rolle": "sprog"},

        {"gruppe": "Læs og forstå", "navn": "Opsummer dokumentet",
         "beskrivelse": "Vedhæft en fil og få hovedpointerne",
         "prompt": "Opsummer det vedhæftede. Giv mig hovedpointerne, "
                   "beslutningerne, og hvad jeg skal handle på.",
         "rolle": ""},
        {"gruppe": "Læs og forstå", "navn": "Træk et referat ud",
         "beskrivelse": "Beslutninger, uenigheder og opgaver",
         "prompt": "Læs referatet og træk ud: hvilke beslutninger blev "
                   "truffet, hvor var der uenighed, og hvem skal gøre hvad "
                   "hvornår.",
         "rolle": ""},
        {"gruppe": "Læs og forstå", "navn": "Forklar det enkelt",
         "beskrivelse": "Som til en ny kollega",
         "prompt": "Forklar det her, så en ny kollega kan forstå det:\n\n",
         "rolle": "underviser"},

        {"gruppe": "Tænk med", "navn": "Få idéer",
         "beskrivelse": "Mange vinkler at vælge imellem",
         "prompt": "Jeg skal bruge idéer til følgende. Giv mig mange "
                   "forskellige vinkler:\n\n",
         "rolle": "sparring"},
        {"gruppe": "Tænk med", "navn": "Udfordr min plan",
         "beskrivelse": "Find hullerne før andre gør",
         "prompt": "Her er min plan. Find hullerne i den:\n\n",
         "rolle": "modspil"},
        {"gruppe": "Tænk med", "navn": "Læs mit udkast kritisk",
         "beskrivelse": "Hvad kan misforstås?",
         "prompt": "Læs udkastet herunder som en skeptisk modtager:\n\n",
         "rolle": "kritisk"},

        {"gruppe": "Gør klar", "navn": "Lav en tjekliste",
         "beskrivelse": "Trin i den rigtige rækkefølge",
         "prompt": "Lav en tjekliste til følgende opgave, med trinnene i den "
                   "rækkefølge de skal tages:\n\n",
         "rolle": ""},
        {"gruppe": "Gør klar", "navn": "Lav et oplæg",
         "beskrivelse": "Klar til Hent som PowerPoint",
         "prompt": "Lav et kort oplæg jeg kan præsentere. Materialet er:\n\n",
         "rolle": ""},

        # Billedopgaver skifter samtidig til en billedmodel. Er der ingen
        # FAL_KEY, findes modellen ikke, og opgaverne vises slet ikke.
        # Stilen står FØR motivet, så brugeren skriver sit motiv til sidst.
        {"gruppe": "Billeder", "navn": "Billede til et slide",
         "beskrivelse": "Roligt og professionelt, plads omkring motivet",
         "prompt": "Lav et billede til et slide. Roligt og professionelt, "
                   "dæmpede farver, god plads omkring motivet, ingen tekst "
                   "i billedet. Motivet er: ",
         "rolle": "", "model": "FLUX schnell"},
        {"gruppe": "Billeder", "navn": "Illustration til intranettet",
         "beskrivelse": "Venlig og enkel, til en nyhed",
         "prompt": "Lav en illustration til en nyhed på intranettet. Enkel "
                   "og venlig stil, lyse farver, ingen tekst i billedet. "
                   "Nyheden handler om: ",
         "rolle": "", "model": "FLUX schnell"},
        {"gruppe": "Billeder", "navn": "Enkelt symbol",
         "beskrivelse": "Fladt piktogram til en vejledning",
         "prompt": "Lav et enkelt, fladt symbol på ensfarvet baggrund. "
                   "Tydelig silhuet, få detaljer, ingen tekst. Symbolet "
                   "skal vise: ",
         "rolle": "", "model": "FLUX schnell"},
        {"gruppe": "Billeder", "navn": "Stemningsbillede",
         "beskrivelse": "Abstrakt forside — i høj kvalitet",
         "prompt": "Lav et abstrakt stemningsbillede til en forside. "
                   "Dæmpede farver, bløde former, ingen mennesker og ingen "
                   "tekst. Stemningen skal være: ",
         "rolle": "", "model": "FLUX dev"},
    ],

    "pii": {
        "aktivt": True,
        # Navne på mønstre og vink der er slået fra. Se PII.alleNavne().
        "slåetFra": [],
        # Ekstra ord pr. vink-gruppe, fx {"Helbredsoplysninger": ["migræne"]}
        "ekstraOrd": {},
        # Skal et vink alene kunne blokere afsendelsen? Som udgangspunkt nej —
        # ellers advarer filteret hver gang nogen skriver "sygemeldt", og så
        # holder folk op med at læse advarslerne.
        "blokerVedVink": False,
    },
}


def _flet(standard, gemt):
    """Gemte værdier lagt oven på standarderne, uden at tabe nye nøgler."""
    ud = dict(standard)
    for nøgle, værdi in (gemt or {}).items():
        if nøgle not in standard:
            continue                      # ukendt nøgle: ignorér
        if isinstance(standard[nøgle], dict) and isinstance(værdi, dict):
            ud[nøgle] = _flet(standard[nøgle], værdi)
        else:
            ud[nøgle] = værdi
    return ud


def hent() -> dict:
    try:
        gemt = json.loads(FIL.read_text(encoding="utf-8"))
    except Exception:
        gemt = {}
    return _flet(STANDARD, gemt)


def gem(nyt: dict) -> dict:
    """Gem det administrator har ændret, og giv den samlede opsætning tilbage."""
    samlet = _flet(STANDARD, nyt)
    FIL.write_text(json.dumps(samlet, ensure_ascii=False, indent=2),
                   encoding="utf-8")
    return samlet


def nulstil() -> dict:
    FIL.unlink(missing_ok=True)
    return hent()
