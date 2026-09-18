# AKA Assistent — egen chat (POC)

En chatflade oven på de model-API'er vi allerede betaler for. Ingen egen
hostet model. Man vælger udbyder i dropdownen, og svaret kommer fra den
valgte models API. Man betaler kun for tokenforbrug.

## Kør lokalt
    pip install -r requirements.txt
    cp .env.example .env        # indsæt nøgler
    uvicorn app:app --reload
    # åbn http://localhost:8000

## Hele idéen
`app.py` taler med alle udbydere gennem samme kode. Vil man tilføje en
skymodel, skriver man én linje i `MODELS`-listen. Nøglerne ligger
server-side i miljøvariabler og kommer aldrig ud i browseren.

## Lokale modeller (Ollama)
Kører Ollama på maskinen, dukker dine installerede modeller op i dropdownen
under **Lokalt på maskinen**. De skal ikke skrives ind nogen steder — vi
spørger Ollama hvad der er installeret, så listen passer af sig selv.

Det virker fordi Ollama også taler OpenAI-formatet: den er bare endnu en
post i `PROVIDERS` med `base_url` mod `localhost:11434/v1/`. Filupload,
Word-eksport og modelskift midt i en chat fungerer præcis som med
skymodellerne.

Kører Ollama ikke, sker der ingenting — listen indeholder så kun
skymodellerne, og appen opfører sig som før. Ligger Ollama et andet sted,
sættes `OLLAMA_URL` i `.env`.

Det er her demoen bliver interessant i en suverænitetssamtale: vælger man
en lokal model, forlader hverken spørgsmål, vedhæftede filer eller svar
maskinen.

## Billeder (fal.ai)
Sæt `FAL_KEY` i `.env`, så dukker **FLUX schnell** og **FLUX dev** op i
dropdownen under **Billeder (fal.ai)**. Vælg en af dem, skriv hvad billedet
skal forestille, og svaret er et billede i stedet for tekst.

Uden nøgle findes de slet ikke i listen — samme princip som med Ollama.

fal taler ikke OpenAI-formatet for billeder, så de ligger ikke i
`PROVIDERS`. `images.py` laver et almindeligt HTTP-kald med nøglen i
headeren. Til gengæld går svaret ud ad **samme SSE-kanal** som teksten:
`{"text": ...}` er tekst, `{"image": ...}` er et billede. Så skal browseren
kun kunne håndtere én slags svar.

Billedet hentes hjem og lægges i `static/genereret/`. Det koster lidt disk,
men gør at billedet stadig er der i morgen, at gemte samtaler ikke går i
stykker når fal rydder op, og at browseren aldrig selv taler med fal.
Mappen ryddes ikke automatisk.

**Flere billedmodeller?** `MODELLER` i toppen af `images.py`. Én linje med
fal's model-id og hvor mange trin den skal bruge.

### Prompten oversættes til engelsk først
Billedmodeller forstår reelt kun engelsk. Får FLUX en dansk prompt, fejler
den ikke — den finder selvsikkert på noget helt andet. "Et rødt æble hvor
der er taget en bid" gav en fugl på et stykke drivtømmer. Samme sætning på
engelsk gav et perfekt æble.

Derfor sendes prompten først gennem en af tekstmodellerne, som laver den om
til en engelsk billedprompt. UI'et viser hvad der faktisk blev sendt afsted,
så man kan se hvorfor man fik det man fik.

Hvilken model der oversætter vælges under **Indstillinger** — fx en lokal
Ollama-model, hvis prompten ikke må forlade maskinen. Standard er
`Mistral Small`. Går oversættelsen galt, sendes originalen videre med en
note i stedet for at fejle.

To ting at vide: billedmodeller ser ikke samtalen — kun den sidste besked
bruges som prompt. Og et genereret billede kan ikke hældes i Word-skabelonen
endnu; der er kun en hent-knap.

Filerne:

| Fil                 | Ansvar |
|---------------------|--------|
| `app.py`            | Routing og glue. Kender hverken PDF eller Word. |
| `extract.py`        | Tekst ud af vedhæftede filer. |
| `docgen.py`         | Struktureret indhold ind i en Word-skabelon. |
| `pptgen.py`         | Struktureret indhold ind i AKA's PowerPoint-skabelon. |
| `images.py`         | Billedgenerering via fal.ai. |
| `settings.py`       | Det administrator kan rette. Standarder i koden, ændringer i `settings.json`. |
| `static/index.html` | Markup. |
| `static/app.css`    | Alt visuelt. Farver og mål står som variabler i toppen. |
| `static/app.js`     | Frontendens logik, delt i nummererede afsnit. |
| `static/pii.js`     | PII-filteret. Mønstrene ligger samlet i toppen. |

Frontenden er stadig uden byggetrin og uden pakker — bare tre filer browseren
henter direkte.

## Udtryk
Farver og formsprog er hentet fra **aka.dk** og stemmer med
PowerPoint-skabelonens tema:

| | |
|---|---|
| Mørk lilla (tekst) | `#2E1760` |
| Lilla (primær knap) | `#5F30C5` |
| Lys lilla | `#BEA1F5` |
| Mint (accent, sparsomt) | `#00FFCC` |
| Baggrund | `#F6F6F6` |

Formsproget følger med: tekstknapper er pilleformede og ikonknapper runde,
som søge- og menuknapperne på aka.dk. Overskrifter står i vægt 500, ikke
fed. Brødteksten er mørk lilla — ikke sort.

**Skriften.** aka.dk bruger Apercu, som er licenseret og derfor ikke ligger
i projektet. `--skrift` prøver den først og falder ellers tilbage på
systemets egen grotesk, som ligger tæt. Har I licensen, så læg filerne i
`static/skrifter/` og fjern kommentaren fra `@font-face` i toppen af
`app.css` — så bruges den automatisk. Der hentes bevidst ingen skrifter
udefra; det ville sende et kald til en tredjepart ved hver sideindlæsning.

**Mørk tilstand** findes ikke på aka.dk, så den er udledt: samme lilla,
vendt om, med en lilla-tonet baggrund frem for neutralt grå. Alle
farvekombinationer er tjekket mod WCAG AA — den laveste er 4,6:1.

## Filupload
Klik på papirclipsen, vælg en fil, og send. Serveren trækker teksten ud og
sender den retur til browseren, som lægger den ind i næste besked. Chippen
over skrivefeltet viser hvad der er vedhæftet, og filnavnet står på beskeden
i samtalen.

Understøttet i dag: **.pdf**, **.docx**, `.txt`, `.md`.
Grænser: 10 MB pr. fil, 60.000 tegn udtrukket tekst (længere filer klippes
af, og chippen skriver "forkortet").

Serveren gemmer ikke filer. Den læser, svarer og glemmer — så er der ingen
sessioner at rydde op i og ingen dokumenter der ligger og flyder.

**Ny filtype?** Skriv en funktion der tager `bytes` og returnerer
`(tekst, kort note)`, og tilføj én linje i `EXTRACTORS` i `extract.py`.
UI'et opdaterer sig selv — filvælgerens `accept` kommer fra `/api/models`.

**Billeder senere.** `Attachment` har allerede et `kind`-felt. Når en model
der kan se skal have billedet, tilføjer man `kind="image"` og pakker det som
en content-blok i stedet for som tekst. Se opskriften nederst i `extract.py`.
Resten af kæden — upload, chip, historik — er den samme.

## Word-dokumenter
Under hvert svar sidder **⬇ Hent som Word**. Det er bevidst bygget i to
skarpt adskilte trin:

1. **Modellen skriver.** Den bliver bedt om struktureret indhold som JSON
   (titel, undertitel, resumé, sektioner med afsnit og punkter). Den ser
   aldrig en Word-fil og bestemmer intet om udseendet.
2. **Skabelonen former.** `docgen.py` hælder indholdet ind i en skabelon med
   python-docx: forside, overskriftsstil, brødtekst, punktopstilling og
   sidefod med sidetal.

Derfor ser alle dokumenter ens ud, uanset hvilken model der svarede, og et
nyt design kræver ikke en ny prompt.

Modeller pakker gerne JSON ind i kodeblokke eller sætter en høflig sætning
foran. `docgen.læs_svar()` klipper ind til første `{` og sidste `}` og
retter manglende eller forkert typede felter op, så en sjusket model ikke
vælter dokumentet.

**Skift skabelon:** lav en ny `Skabelon(...)` og tilføj den i `SKABELONER`
nederst i `docgen.py`. Farve, skrift, afsender og om der er forside er
felter på den — koden der bygger dokumentet er den samme.

**Rigtig Word-skabelon:** når designafdelingen leverer en `.docx` med logo
og typografier, peger man `grundfil` på den. Så arver dokumentet alt fra
Word-filen, og det er den fil man vedligeholder fremover — ikke koden.

## PowerPoint
Ved siden af Word-knappen sidder **Hent som PowerPoint**. Samme princip,
samme endepunkt — kun `format` i kaldet skifter, og så spørges `pptgen.py`
i stedet for `docgen.py`.

Skabelonen er AKA's egen `templates/aka.pptx`. Vi åbner den og bruger dens
layouts, så hvert slide arver skrifter, farver, logo og grafik direkte fra
designfilen. Der står ikke én farvekode om AKA's udtryk i koden.

Fire slidetyper, hver bundet til et layout i skabelonen:

| Type | Layout i skabelonen |
|------|---------------------|
| forside | Intro Slide |
| emne | Emne Slide Mørk |
| punkter | 1_Tekst Slide + Billede |
| citat | Citat Slide Lys |

**Det svære er ikke at lave filen — det er at få teksten til at passe.**
Et Word-dokument bliver bare længere når modellen skriver for meget. Et
slide har en fast ramme. Derfor er der to slags værn:

- **Hårde grænser i koden**, ikke kun i prompten: højst 6 punkter pr. slide,
  110 tegn pr. punkt, 70 tegn i en overskrift. Det der ikke er plads til,
  ryger i talernoterne i stedet for at forsvinde.
- **Automatisk tilpasning af skriftstørrelsen.** python-pptx kan ikke måle
  tekst, så `_vælg_størrelse()` regner selv på hvor mange linjer teksten
  fylder og skrumper til den passer i rammen. Rammens mål læses fra
  skabelonen, så det stadig regner rigtigt hvis I skifter .pptx-fil.
  Passer teksten i forvejen, rører vi den ikke — så beholder korte
  overskrifter præcis skabelonens egen størrelse.

Talernoter er en del af skemaet. Det uddybende hører til der, ikke på
slidet, og modellen bliver bedt om at bruge dem.

**Bemærk:** AKA-skabelonen sætter selv `buNone` på tekstslides, så punkter
står uden punkttegn. Det er skabelonens design, ikke en fejl — vil I have
punkttegn, er det `.pptx`-filen der skal rettes, ikke koden.

**Ny skabelon:** læg en `.pptx` i `templates/` og tilføj en `Skabelon` i
`pptgen.py` med layoutnavnene og placeholder-numrene. De numre kan læses ud
af filen med python-pptx — se kommentarerne i `AKA`-opsætningen.

## Gemte samtaler
Samtalerne ligger i browserens `localStorage` — ikke på serveren. De gemmes
af sig selv efter hver besked, og listen i venstre side grupperer dem efter
hvornår de sidst blev rørt.

Det er et bevidst valg så længe der ikke er login: uden en bruger at binde
samtalerne til ville server-side lagring blande alle medarbejderes chats
sammen i én bunke. Konsekvensen er at samtalerne følger **maskinen og
browseren**, ikke personen — rydder man browserdata, er de væk, og de
findes ikke på en anden computer.

Vær opmærksom på at samtalerne står ukrypteret i browserprofilen. Skal det
i drift med rigtige medlemsdata, hører de hjemme på serveren bag SSO.
Flytningen er afgrænset til afsnit 6 i `static/app.js` — resten af koden
rører ikke lagringen.

Der gemmes højst 60 samtaler. Løber browserens plads op, ryddes de ældste,
og brugeren får det at vide.

## Roller
Over skrivefeltet vælger man en **rolle** for samtalen — fx *Djævlens
advokat*, *Sprogvasker* eller *Kreativ sparringspartner*. Rollen lægges
oven på systemprompten, den erstatter den ikke: sproget og rammen om at det
er AKA's assistent gælder stadig.

Browseren sender kun rollens **id**. Selve instruksen ligger server-side og
er defineret af administrator, så en bruger kan hverken se eller ændre den.

Rollen hører til chatten, ikke til den enkelte besked. Den gemmes sammen med
samtalen og følger med når man åbner den igen — og med når man bygger et
Word- eller PowerPoint-dokument, så tonen er den samme.

## Opgavebibliotek
Færdige opgaver man kan klikke på: *Svar på en henvendelse · Ret sproget
igennem · Opsummer dokumentet · Udfordr min plan · Lav en tjekliste*. De
vises på tom-skærmen og kan hentes frem igen med **Opgaver** over
skrivefeltet.

Det løser det problem, at folk der ikke bruger AI til daglig åbner en tom
boks og ikke ved hvad de skal skrive. Her kan de se hvad værktøjet er til.

**Startskærmen viser grupperne, ikke alle opgaverne.** Fem valg er til at
overskue; seksten er en menu. Ét klik åbner gruppens 2-4 opgaver, og
undertitlen på hvert gruppekort viser hvad der gemmer sig — uden at det
bliver til flere valg. **Opgaver**-knappen over skrivefeltet viser fortsat
hele listen, for der er man kommet for at lede.

Selve opgavekortene er tegnet efter tre ting, som alle er målt frem og
ikke gættet:

- **Det er en menu, ikke brødtekst**, så den er ikke låst til tekstspaltens
  bredde. Den fylder vinduet ud.
- **To spalter, ikke tre.** Grupperne har 4-3-3-2-4 opgaver. To spalter
  giver kun to huller i gitteret; tre giver fem — og klipper samtidig
  forklaringerne.
- **Ikon pr. gruppe.** Seksten ens hvide rektangler kan man ikke skimme.
  Ikonet fortæller hvilken slags opgave det er, før man har læst titlen.

En opgave lægger sin tekst i skrivefeltet med markøren klar til sidst. Har
opgaven en rolle der passer, sættes den samtidig — *Udfordr min plan* slår
Djævlens advokat til, uden at brugeren skal vide hvordan.

**Billedopgaver** skifter på samme måde selv til en billedmodel: *Billede
til et slide · Illustration til intranettet · Enkelt symbol ·
Stemningsbillede*. Brugeren skal ikke vide hvilken model der kan tegne.
Stilen står i opgaven, og motivet skriver man til sidst — så bliver
resultatet ensartet uden at nogen skal lære at skrive billedprompter.

Kræver en opgave en model der ikke findes — fx fordi der ikke er nogen
`FAL_KEY` — vises opgaven slet ikke. Samme princip som resten: er noget
ikke sat op, findes det ikke.

Roller gælder kun tekstmodeller. Vælger man en billedmodel, slukkes
rollevælgeren, for en billedmodel får ikke systemprompten.

Begge dele redigeres under Indstillinger: navn, forklaring, instruks og
hvilken rolle en opgave skal slå til. Standarderne står i `settings.py`.

## Indstillinger (administratorsiden)
Tandhjulet i headeren åbner en side hvor man kan se og rette systemprompten,
svarlængden, hvilken model der oversætter billedprompter, og hele
GDPR-filteret. Ændringer gemmes server-side i `settings.json` og slår
igennem med det samme — ingen genstart.

Standardværdierne står i `settings.py`. Kun forskellen gemmes i filen, så
nye indstillinger i en senere version dukker op af sig selv i stedet for at
blive overskrevet af en gammel fil. "Nulstil alt" sletter filen igen.

Systemprompten ligger bevidst server-side. Browseren får den aldrig at se
som noget den kan ændre — kun denne side kan rette den.

**Der er ingen adgangskontrol.** Alle er administrator. Det er et bevidst
valg i en demo, men også det første der skal laves om, hvis den skal ud til
flere end dig selv.

## GDPR-filter
Før en besked sendes, scannes den i browseren. Alt sker lokalt — `pii.js`
taler ikke med serveren, og det filteret fanger forlader aldrig maskinen.

Der er to slags fund, og forskellen er vigtig:

**Fund** er genkendte formater: CPR-nummer, telefonnummer, e-mailadresse,
IBAN, kontonummer, kreditkortnummer, ICD-10-diagnosekoder, og navne når
nogen præsenterer sig ("jeg hedder …"). De **blokerer** afsendelsen, vises
med hvad der blev fundet, og fremhæves i selve teksten. Brugeren kan rette,
sende alligevel, eller slå filteret fra for den enkelte chat.

**Vink** er ord der peger på særlige kategorier efter artikel 9 — helbred og
fagforeningsforhold. De **blokerer ikke**, men vises stille mens man skriver.
Ellers ville filteret advare hver gang nogen skriver "sygemeldt", og så
holder folk op med at læse advarslerne. Administrator kan slå blokering til
for vink også.

Kreditkort tjekkes med Luhn og IBAN med mod-97, så tilfældige tal ikke
udløser alarm. CPR-numre **med bindestreg** meldes uanset om fødselsdatoen er
gyldig — testnumre har sjældent en, og et misset CPR er værre end en falsk
alarm. Uden bindestreg kræves en gyldig dato, ellers ville ethvert
titencifret tal blive meldt.

**Flere mønstre?** Listerne `MØNSTRE` og `VINK` i toppen af `static/pii.js`.
Rækkefølgen er prioriteret, så det mest specifikke mønster vinder ved
overlap. Ekstra ord til vink kan tilføjes direkte på administratorsiden
uden at røre koden.

Vær ærlig om hvad det er: filteret genkender **formater og faste vendinger**.
Det kan ikke fange navne, adresser eller helbred skrevet frit i teksten, det
kigger ikke i vedhæftede filer, og det ved intet om jeres behandlingsgrundlag.
Det kan derfor heller ikke afgøre om noget er en overtrædelse — kun at der
står noget der ligner personoplysninger. Det er en påmindelse, ikke en
garanti, og den formulering står også i UI'et.

## Lange svar
Modellerne har et loft for hvor meget de må skrive. Rammer de det, stopper
de **midt i en sætning** — og uden en besked ser det ud som om de var
færdige. På et halvfærdigt program er det svært at gennemskue.

Derfor kigger `stream()` på `finish_reason`. Er den `"length"`, sendes en
`afkortet`-hændelse ud ad SSE-kanalen, og UI'et viser en linje under svaret
med knappen **Fortsæt svaret**. Fortsættelsen strømmer ind i det samme svar
— ikke som en ny boble — så teksten står som ét hele, også når samtalen
gemmes og hentes frem igen.

Instruksen om at fortsætte lægges på server-side, så den ikke havner i den
gemte samtale.

Standardgrænsen er 4096 tokens, hvilket rækker til et typisk lille
HTML-program. Den kan sættes op til 32.000 under Indstillinger.

## Kendte kanter
- GDPR-filteret scanner kun det brugeren skriver, ikke vedhæftede filer. Et
  CPR-nummer inde i en PDF bliver altså ikke fanget.
- Indstillingssiden har ingen adgangskontrol. Enhver med adgang til appen
  kan ændre systemprompten og slå filteret fra.
- Scannede PDF'er uden tekstlag kan ikke læses. Brugeren får det at vide.
  OCR ville være næste skridt.
- Tabeller i .docx læses, men havner samlet til sidst i teksten, fordi
  python-docx lister dem for sig.
- Markdown oversættes af en lille indbygget parser (afsnit 4 i `app.js`).
  Den dækker overskrifter, lister, tabeller, kode, citater og links — ikke
  fodnoter og andre randformater.

## Fra POC til drift
- Skift Anthropics OpenAI-kompatible endpoint ud med det native SDK, hvis
  I vil have prompt caching og de sidste features. Mistral kan blive på
  OpenAI-formatet.
- Læg login foran (SSO), og sæt en LiteLLM-gateway imellem hvis I vil have
  forbrugslogning og budgetter pr. bruger. Se platform-eksemplet.
- Læg rettigheder på indstillingssiden, så ikke enhver bruger kan ændre
  systemprompten eller slå GDPR-filteret fra.
- Flyt samtalerne fra browseren til serveren, når der er en bruger at binde
  dem til.
- Sæt en grænse på uploadstørrelse og en virusscanning foran, hvis det skal
  ud til alle medarbejdere.
- Overvej om PII-filteret også skal scanne vedhæftede filer, og om det skal
  kunne blokere helt i stedet for kun at advare.
