# CLAUDE.md — AIChat

AIChat ("Chat" i UI'et) er Haij-familiens chatflade oven på de
model-API'er man allerede betaler for: Anthropic, Mistral, lokale modeller
via Ollama og billeder via fal.ai. Ingen egen hostet model. Den er startet
som en kunde-POC og er på vej ind i Haij-familien (haij.dk). Læs denne fil
helt igennem ved start af hver session.

## Hvad appen gør

- Chat med streaming (SSE) mod alle udbydere gennem OpenAI-formatet —
  samme kode, kun base-URL, nøgle og modelnavn skifter (`app.py`).
- Filupload: tekst ud af .pdf, .docx, .txt, .md (`extract.py`). Serveren
  gemmer intet; browseren bærer teksten videre i samtalen.
- Word- og PowerPoint-eksport i to skarpt adskilte trin: modellen leverer
  indhold som JSON, skabelonlaget former det (`docgen.py`, `pptgen.py`).
  PowerPoint-skabelonen `templates/haij.pptx` bygges af
  `templates/lav_haij_pptx.py` — ret dér, kør scriptet, commit filen.
- Billedgenerering via fal.ai med dansk → engelsk prompt-oversættelse
  (`images.py`).
- Administratorside: systemprompt, roller, opgavebibliotek, PII-filter.
  Standarder i `settings.py`, kun forskellen gemmes i `settings.json`.
- PII-filter i browseren (`static/pii.js`) — advarer og blokerer før
  afsendelse; alt sker lokalt.
- Samtaler ligger i browserens localStorage, ikke på serveren.

## Stack

- Python 3.12+, FastAPI, uvicorn, openai-SDK (mod OpenAI-kompatible
  endpoints), httpx, pypdf, python-docx, python-pptx.
- Frontend uden byggetrin og uden pakker: `static/index.html`,
  `static/app.css`, `static/app.js`, `static/pii.js`. Skrifterne (Archivo,
  Geist Mono, OFL) ligger i `static/skrifter/` — intet hentes udefra.
- Design: Haij-tokens (varmt papir, mosgrøn) i toppen af `app.css`. Hex-
  værdierne skal stemme med `globals.css` i de andre Haij-apps.
- Ingen database. Ingen testsuite endnu.
- `docker-compose.yml` og `litellm-config.yaml` er en *separat*
  platform-variant (Open WebUI + LiteLLM) — de kører ikke denne app.

## Kommandoer

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                 # indsæt nøgler; alle er valgfrie
.venv/bin/uvicorn app:app --reload   # http://localhost:8000
```

Der er ingen tests. Det der skal være grønt: appen starter, `GET
/api/models` og `GET /api/settings` svarer 200, og forsiden kan hentes.
Kør det før hvert commit.

## Filer og ansvar

| Fil | Ansvar |
|-----|--------|
| `app.py` | Routing og glue. Kender hverken PDF, Word eller fal. |
| `extract.py` | Tekst ud af vedhæftede filer. Ny filtype = én linje i `EXTRACTORS`. |
| `docgen.py` | Indhold ind i Word-skabelon. |
| `pptgen.py` | Indhold ind i PowerPoint-skabelon (`templates/haij.pptx`). |
| `images.py` | fal.ai-kald. Nye billedmodeller i `MODELLER`. |
| `settings.py` | Alt administrator kan rette. Standarder her, ændringer i `settings.json`. |
| `static/` | Hele frontenden. |

## Regler

- **Claude leverer til main; Martin leverer til produktion.** Push til
  main deployer ingenting. Deploy er et manuelt skridt Martin udfører.
  Push alligevel kun når appen starter og svarer — main er det der
  bliver deployet. Sæt ikke hosting eller deploy op.
- Aldrig en nøgle i repoet. Nøgler læses kun fra miljøet (`.env` er
  gitignored; `.env.example` skal dække alt koden læser).
- `settings.json` og `static/genereret/` er kørselsdata og er gitignored.
- Spørg før en ny afhængighed tilføjes.
- Slet ikke filer uden udtrykkelig accept.
- Kode, kommentarer og UI er på dansk i dette repo. Behold den stil i
  nye ændringer — en oversættelse til engelsk kode er en selvstændig
  beslutning, ikke noget der sker undervejs.
- En udbyder der ikke er sat op, findes ikke i UI'et. Bevar det princip
  ved nye udbydere: ingen nøgle, ingen model i dropdownen, ingen fejl.
- Hold `app.py` fri for udbyderdetaljer: nyt format eller ny udbyder får
  sit eget modul ved siden af `docgen.py`/`images.py`.
- Ingen kundenavne, kundeskabeloner eller kundespecifikke prompter i
  repoet. Det er et Haij-værktøj; kundetilpasning sker i `settings.json`.

## På vej ind i Haij — det der udestår

Haij-dogmerne (åben kildekode, self-hosting, EU eller self-hosted, sikker
fra dag ét) er ikke opfyldt endnu. Kendte huller, i prioriteret rækkefølge:

1. Ingen adgangskontrol — administratorsiden er åben for alle. Login
   (passkeys/TOTP som i resten af familien) før den må hostes.
2. Anthropic og fal.ai er ikke EU-udbydere. Mistral og Ollama er
   standarden; de andre skal være tydeligt markeret som tilvalg.
3. Ingen Dockerfile for selve appen, ingen healthcheck, ingen tests.
4. Samtaler i localStorage: fint uden login, men skal server-side bag
   login med eksport pr. bruger.
5. LICENSE (AGPL-3.0) og SECURITY.md mangler.
