"""
AKA Assistent — minimal backend.

Hele pointen: begge udbydere tales til med SAMME kode. Kun base-URL,
API-nøgle og modelnavn skifter. Vi bruger de OpenAI-kompatible endpoints,
så vi slipper for to forskellige SDK'er.

Filen her er kun routing og glue. Det egentlige arbejde ligger ved siden af:
    extract.py  — tekst ud af vedhæftede filer
    docgen.py   — struktureret indhold ind i en Word-skabelon

Kør:
    pip install -r requirements.txt
    cp .env.example .env   # og indsæt dine nøgler
    uvicorn app:app --reload

Åbn http://localhost:8000
"""
from dotenv import load_dotenv
load_dotenv()
import os
import json
import time
import httpx
from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from openai import OpenAI

import extract
import docgen
import pptgen
import images
import settings

# Ollama kører lokalt og taler også OpenAI-formatet. Sæt OLLAMA_URL hvis den
# ligger et andet sted end standardporten.
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")

# --- Udbyderne. Samme klasse, forskellig base-URL og nøgle. ----------------
# En udbyder uden nøgle oprettes slet ikke: SDK'et nægter at starte med en
# tom nøgle, og så ville appen ikke kunne køre på Ollama alene. Samme
# princip som med Ollama og fal.ai — er den ikke sat op, findes den ikke.
PROVIDERS = {}

if os.environ.get("ANTHROPIC_API_KEY"):
    PROVIDERS["claude"] = OpenAI(
        base_url="https://api.anthropic.com/v1/",
        api_key=os.environ["ANTHROPIC_API_KEY"],
    )

if os.environ.get("MISTRAL_API_KEY"):
    PROVIDERS["mistral"] = OpenAI(
        base_url="https://api.mistral.ai/v1/",
        api_key=os.environ["MISTRAL_API_KEY"],
    )

# Ollama er ligeglad med nøglen, men SDK'et kræver at der står noget.
PROVIDERS["ollama"] = OpenAI(
    base_url=f"{OLLAMA_URL}/v1/",
    api_key="ollama",
)

# --- Modeller i skyen. Tilføj/fjern frit. ---------------------------------
# Nøglen er det navn UI'et sender. Værdien er hvilken udbyder + hvilket
# rigtigt modelnavn kaldet skal bruge.
MODELS = {
    "Claude Sonnet":  {"provider": "claude",  "model": "claude-sonnet-5"},
    "Claude Opus":    {"provider": "claude",  "model": "claude-opus-4-8"},
    "Mistral Large":  {"provider": "mistral", "model": "mistral-large-latest"},
    "Mistral Small":  {"provider": "mistral", "model": "mistral-small-latest"},
}

# --- Modeller på maskinen -------------------------------------------------
# De skrives ikke i listen ovenfor. Vi spørger i stedet Ollama hvad der rent
# faktisk er installeret, så listen passer uden at nogen vedligeholder den.

_lokalt = {"hentet": 0.0, "modeller": {}}


def lokale_modeller():
    """Hvad ligger der på maskinen lige nu?

    Kører Ollama ikke, får vi ingenting — og appen fungerer præcis som før.
    Det er derfor der ikke kastes en fejl her.
    """
    if time.time() - _lokalt["hentet"] < 30:
        return _lokalt["modeller"]

    fundet = {}
    try:
        svar = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=1.5)
        svar.raise_for_status()
        for m in svar.json().get("models", []):
            navn = m.get("name")
            if navn:
                fundet[navn] = {"provider": "ollama", "model": navn}
    except Exception:
        pass

    _lokalt.update(hentet=time.time(), modeller=fundet)
    return fundet


def billedmodeller():
    """Billedmodeller hos fal.ai — kun hvis der er en nøgle."""
    if not images.tilgængelig():
        return {}
    return {navn: {"provider": "fal", "model": navn} for navn in images.MODELLER}


def alle_modeller():
    """Sky + lokalt + billeder, i den rækkefølge de skal stå i dropdownen.

    Skymodeller hvis udbyder ikke har en nøgle, sorteres fra her — så
    dropdownen kun viser det der faktisk kan svare.
    """
    sky = {navn: v for navn, v in MODELS.items() if v["provider"] in PROVIDERS}
    return {**sky, **lokale_modeller(), **billedmodeller()}

# Systemprompten og de andre knapper administrator kan dreje på ligger i
# settings.py, ikke som konstanter her. De hentes ved hvert kald, så en
# ændring slår igennem uden genstart.

app = FastAPI()


# Frontenden er tre filer browseren henter direkte. Uden Cache-Control
# gætter browseren selv hvor længe den må gemme dem, og så kan man rette i
# app.js uden at ændringen slår igennem — man ser en gammel version og
# leder efter en fejl der ikke findes.
#
# "no-cache" betyder ikke "gem ikke", men "spørg først". Sammen med den
# ETag StaticFiles allerede sender koster det et 304-svar når intet er
# ændret. Genererede billeder er undtaget: de ændrer sig aldrig.
KODEFILER = (".js", ".css", ".html")


@app.middleware("http")
async def spørg_før_genbrug(request: Request, call_next):
    svar = await call_next(request)
    sti = request.url.path
    if sti == "/" or (sti.endswith(KODEFILER) and "/genereret/" not in sti):
        svar.headers["Cache-Control"] = "no-cache"
    return svar


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def home():
    return FileResponse("static/index.html")


@app.get("/api/models")
def list_models():
    """UI'et henter listen herfra, så vi kun vedligeholder den ét sted.

    Udbyderen følger med, så dropdownen kan gruppere modellerne.
    """
    return {
        "models": [{"name": navn, "provider": v["provider"]}
                   for navn, v in alle_modeller().items()],
        "uploads": extract.SUPPORTED,
    }


@app.get("/api/settings")
def hent_indstillinger():
    """Alt administrator kan dreje på, plus lidt der kun kan ses.

    Der er ingen adgangskontrol. Det er en demo, og alle er administrator —
    skal den i drift, hører der login og rettigheder til her.
    """
    opsætning = settings.hent()
    return {
        "indstillinger": opsætning,
        "standard": settings.STANDARD,
        # Til orientering i UI'et. Nøgler vises aldrig, kun om de findes.
        "status": {
            "udbydere": {
                "Anthropic": bool(os.environ.get("ANTHROPIC_API_KEY")),
                "Mistral": bool(os.environ.get("MISTRAL_API_KEY")),
                "Ollama": bool(lokale_modeller()),
                "fal.ai": images.tilgængelig(),
            },
            "modeller": list(alle_modeller()),
            "filtyper": extract.SUPPORTED,
            "skabeloner": list(docgen.SKABELONER),
        },
    }


@app.put("/api/settings")
async def gem_indstillinger(request: Request):
    return {"indstillinger": settings.gem(await request.json())}


@app.post("/api/settings/nulstil")
def nulstil_indstillinger():
    return {"indstillinger": settings.nulstil()}


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    """Tag imod en fil, træk teksten ud, giv den tilbage til browseren.

    Serveren gemmer ingenting. Browseren holder på teksten og sender den
    med i næste besked — så er samtalen selvbærende, og vi slipper for
    sessioner og oprydning.
    """
    data = await file.read()
    try:
        attachment = extract.extract(file.filename, data)
    except extract.UploadError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return attachment.as_dict()


def find(navn):
    """Modelnavn fra UI'et → posten i modellisten. Falder tilbage til den
    første, så et ukendt navn ikke vælter kaldet."""
    modeller = alle_modeller()
    if not modeller:
        raise HTTPException(status_code=503, detail=(
            "Ingen modeller er sat op. Sæt en nøgle i .env eller start Ollama."))
    return modeller.get(navn) or next(iter(modeller.values()))


def vælg(navn):
    """Modelnavn fra UI'et → (klient, rigtigt modelnavn)."""
    valg = find(navn)
    return PROVIDERS[valg["provider"]], valg["model"]


def systemprompt(opsætning, rolle_id):
    """Systemprompten, eventuelt med en rolle lagt oven på.

    Rollen erstatter ikke prompten — den lægges efter. Så gælder det at
    svaret er på dansk og kommer fra AKA's assistent stadig, uanset hvilken
    rolle brugeren har valgt. Browseren sender kun et id; selve teksten
    ligger server-side, hvor administrator bestemmer den.
    """
    prompt = opsætning["system"]
    if not rolle_id:
        return prompt
    for rolle in opsætning.get("roller") or []:
        if rolle.get("id") == rolle_id and rolle.get("instruks"):
            return prompt + "\n\n" + rolle["instruks"]
    return prompt


def sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


FORTSÆT = (
    "Fortsæt præcis hvor du slap. Dit forrige svar blev afbrudt midt i en "
    "sætning. Genoptag fra det allersidste tegn — gentag ikke noget, spring "
    "intet over, og skriv ingen indledning eller forklaring."
)

# Blev svaret klippet af inde i en ``` -blok, ved modellen det ikke, og så
# åbner den en ny blok. Det splitter koden i to og kan tabe et stykke i
# overgangen. Derfor siger vi det udtrykkeligt.
I_KODEBLOK = (
    "\n\nVIGTIGT: dit forrige svar stoppede INDE i en kodeblok, som stadig "
    "er åben. Skriv IKKE ``` igen, og skriv ikke sprognavnet. Fortsæt kun "
    "den rå kode fra det tegn hvor den slap, og luk blokken med ``` når "
    "koden er færdig."
)


def i_åben_kodeblok(messages) -> bool:
    """Stod det seneste svar midt i en ``` -blok?"""
    for besked in reversed(messages or []):
        if besked.get("role") == "assistant":
            return (besked.get("content") or "").count("```") % 2 == 1
    return False


@app.post("/api/chat")
async def chat(request: Request):
    payload = await request.json()
    valg = find(payload.get("model"))

    # Billedmodeller går en anden vej — men ud ad samme rør, så UI'et kun
    # skal kende én slags svar.
    if valg["provider"] == "fal":
        return StreamingResponse(billedstrøm(payload, valg["model"]),
                                 media_type="text/event-stream")

    opsætning = settings.hent()
    client, model = PROVIDERS[valg["provider"]], valg["model"]
    messages = ([{"role": "system",
                  "content": systemprompt(opsætning, payload.get("rolle"))}]
                + payload["messages"])

    # Blev det forrige svar klippet af ved token-loftet, kan brugeren bede om
    # resten. Instruksen lægges på her og ikke i browseren, så den ikke
    # havner i den gemte samtale.
    if payload.get("fortsæt"):
        instruks = FORTSÆT
        if i_åben_kodeblok(payload.get("messages")):
            instruks += I_KODEBLOK
        messages.append({"role": "user", "content": instruks})

    def stream():
        # Svaret er allerede sendt afsted med status 200, så en fejl herinde
        # kan ikke blive til en HTTP-fejlkode. Den skal ud ad røret som en
        # error-hændelse — ellers stopper strømmen bare, og brugeren står
        # tilbage med en tom boble og ingen forklaring.
        fik_noget = False
        afkortet = False
        try:
            # stream=True giver ord-for-ord svar — det er det der føles hurtigt.
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=opsætning["max_tokens"],
                stream=True,
            )
            for chunk in response:
                # Nogle udbydere sender en sidste chunk uden valgmuligheder
                # (kun forbrugstal). Den må ikke vælte løkken.
                if not chunk.choices:
                    continue
                valgt = chunk.choices[0]
                delta = valgt.delta.content
                if delta:
                    fik_noget = True
                    yield sse({"text": delta})
                # "length" betyder at modellen ramte loftet og blev klippet
                # midt i en sætning. Uden det her ser brugeren bare et svar
                # der stopper — og tror modellen var færdig.
                if valgt.finish_reason == "length":
                    afkortet = True
        except Exception as e:
            yield sse({"error": modelfejl(e)})
        else:
            # Et tomt svar er ikke en fejl for udbyderen, men det ser ud som
            # om intet skete. Ollama gør det mens en kold model læses ind.
            if not fik_noget:
                hint = (" Lokale modeller kan svare tomt første gang de "
                        "læses ind i hukommelsen." if valg["provider"] == "ollama"
                        else "")
                yield sse({"error": "Modellen svarede tomt. Prøv igen." + hint})
            elif afkortet:
                yield sse({"afkortet": True})
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


def modelfejl(e: Exception) -> str:
    """Gør udbyderens fejl til noget en bruger kan handle på."""
    besked = getattr(e, "message", None) or str(e)
    # OpenAI-klienten pakker udbyderens tekst ind i en lang repr. Den
    # interessante sætning står i selve fejlen fra API'et.
    krop = getattr(getattr(e, "response", None), "text", "") or ""
    try:
        indre = json.loads(krop).get("error", {}).get("message")
        if indre:
            besked = indre
    except Exception:
        pass
    return f"Modellen svarede ikke: {besked}"


# Billedmodeller forstår reelt kun engelsk. Får FLUX en dansk prompt,
# fejler den ikke — den finder selvsikkert på noget helt andet. "Et rødt
# æble hvor der er taget en bid" giver en fugl på et stykke drivtømmer.
#
# Derfor oversætter vi først, med en af de tekstmodeller vi alligevel har.
# Hvilken model, vælges under Indstillinger.
OVERSÆT = (
    "Lav brugerens ønske om til en kort engelsk billedprompt. "
    "Behold alle detaljer om motiv, stil og stemning. "
    "Svar kun med prompten — ingen anførselstegn, ingen forklaring."
)


def til_billedprompt(tekst: str) -> tuple[str, str]:
    """Dansk ønske → engelsk billedprompt.

    Returnerer (prompt_til_fal, note). Går oversættelsen galt, sender vi
    originalen videre — et middelmådigt billede er bedre end ingenting,
    og noten fortæller brugeren hvad der skete.
    """
    try:
        client, model = vælg(settings.hent()["billedprompt_model"])
        svar = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": OVERSÆT},
                      {"role": "user", "content": tekst}],
            max_tokens=300,
        )
        engelsk = (svar.choices[0].message.content or "").strip().strip('"')
        if engelsk:
            return engelsk, ""
        return tekst, "Prompten kunne ikke oversættes og blev sendt som den er."
    except Exception:
        return tekst, ("Prompten kunne ikke oversættes til engelsk og blev "
                       "sendt som den er. Billedmodeller rammer sjældent "
                       "rigtigt på dansk.")


def billedstrøm(payload, model_navn):
    """Ét billede ud ad SSE-røret.

    Der er ikke noget at streame — billedet er enten færdigt eller ikke.
    Vi bruger alligevel samme kanal, så browseren kun skal kunne håndtere
    én slags svar. "text" er tekst, "image" er et billede.

    Prompten er den rå tekst brugeren skrev, ikke den pakkede besked. Var
    det den pakkede, ville et vedhæftet dokument ende som prompt.
    """
    ønske = (payload.get("prompt") or "").strip()
    if not ønske:
        # Sikkerhedsnet hvis UI'et glemmer feltet: brug sidste brugerbesked.
        for besked in reversed(payload.get("messages") or []):
            if besked.get("role") == "user":
                ønske = besked.get("content", "")
                break

    prompt, note = til_billedprompt(ønske)

    try:
        billede = images.generer(prompt, model_navn,
                                 payload.get("size", "bred"))
        # Brugeren skal kunne se hvad der faktisk blev sendt afsted.
        billede["ønske"] = ønske
        billede["note"] = note
        yield sse({"image": billede})
    except images.BilledeFejl as e:
        yield sse({"error": str(e)})
    yield "data: [DONE]\n\n"


# De to formater, ét sted. Vil man have Excel med, er det en linje mere her
# og et modul der ser ud som docgen og pptgen.
FORMATER = {
    "docx": {
        "modul": docgen,
        "type": ("application/vnd.openxmlformats-officedocument"
                 ".wordprocessingml.document"),
    },
    "pptx": {
        "modul": pptgen,
        "type": ("application/vnd.openxmlformats-officedocument"
                 ".presentationml.presentation"),
    },
}


@app.post("/api/document")
async def document(request: Request):
    """Samtale ind, færdigt dokument ud — Word eller PowerPoint.

    To skarpt adskilte trin — det er hele pointen:
      1. Modellen leverer INDHOLD som JSON. Den ser aldrig en Office-fil.
      2. Skabelonlaget hælder indholdet i en skabelon. Formen er vores,
         ikke modellens, så alt output ser ens ud.

    Forskellen mellem de to formater er kun hvilket modul der spørges.
    """
    payload = await request.json()
    client, model = vælg(payload.get("model"))
    valgt = FORMATER.get(payload.get("format", "docx"), FORMATER["docx"])
    modul = valgt["modul"]

    skabelon = modul.SKABELONER.get(payload.get("template", modul.STANDARD),
                                    modul.SKABELONER[modul.STANDARD])

    # 1. Bed om struktur. Samtalen som kontekst, instruksen til sidst.
    messages = ([{"role": "system",
                  "content": systemprompt(settings.hent(), payload.get("rolle"))}]
                + payload["messages"]
                + [{"role": "user", "content": modul.INSTRUKS}])
    try:
        svar = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=4096,
        )
        indhold = modul.læs_svar(svar.choices[0].message.content or "")
    except ValueError as e:
        # Modellen holdt sig ikke til skemaet — sig det ligeud.
        raise HTTPException(status_code=502, detail=str(e))

    # 2. Hæld det i skabelonen.
    data = modul.byg(indhold, skabelon)
    navn = modul.filnavn(indhold["titel"])

    return Response(
        content=data,
        media_type=valgt["type"],
        headers={"Content-Disposition": f'attachment; filename="{navn}"'},
    )
