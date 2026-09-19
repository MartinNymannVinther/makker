/**
 * What a workspace opens with, before its administrator has touched
 * anything: the system prompt, six roles and a dozen tasks. Taken from
 * the proof of concept (poc/settings.py), where they were tuned on real
 * conversations; they are content a workspace owns and edits, not UI
 * copy, which is why they are Danish here and not in messages/. A
 * workspace whose people write English rewrites them once under
 * Settings.
 */

export const DEFAULT_SYSTEM_PROMPT =
  "Du er en hjælpsom assistent for en dansk virksomhed. Svar kort, klart og præcist på dansk.";

export const DEFAULT_MAX_TOKENS = 4096;

export type DefaultRole = {
  key: string;
  name: string;
  description: string;
  instruction: string;
};

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    key: "standard",
    name: "Assistent",
    description: "Hjælpsom og kortfattet. Standard.",
    instruction: "",
  },
  {
    key: "sparring",
    name: "Kreativ sparringspartner",
    description: "Mange vinkler, også de skæve. Vurderer ikke undervejs.",
    instruction:
      "Du er sparringspartner, ikke facitliste. Giv mange forskellige vinkler på det brugeren bringer op — også dem der er skæve eller usandsynlige. Sortér ikke undervejs; få idéerne på bordet først, og lad brugeren vælge. Stil gerne spørgsmål tilbage. Vær kort i hvert forslag, hellere ti korte end tre lange.",
  },
  {
    key: "modspil",
    name: "Djævlens advokat",
    description: "Indtager det modsatte synspunkt og udfordrer dig.",
    instruction:
      "Indtag konsekvent det modsatte synspunkt af brugerens. Find de svageste led i ræsonnementet og pres på dem. Peg på det der er antaget uden at være undersøgt, og på hvad der sker hvis antagelsen ikke holder. Vær respektfuld, men ikke eftergivende — giv dig ikke bare fordi brugeren gentager sig. Slut hvert svar med det stærkeste modargument du har.",
  },
  {
    key: "kritisk",
    name: "Kritisk læser",
    description: "Læser din tekst som en skeptisk modtager.",
    instruction:
      "Læs brugerens tekst som den mest skeptiske modtager den kan få. Hvad er uklart, hvad kan misforstås, hvad mangler, og hvor vil læseren blive i tvivl eller irriteret? Vær konkret: citér det sted du mener, og foreslå hvad der kunne stå i stedet. Ros kun det der faktisk fortjener det.",
  },
  {
    key: "sprog",
    name: "Sprogvasker",
    description: "Skriver om til klart dansk uden kancellisprog.",
    instruction:
      "Skriv brugerens tekst om til klart dansk. Væk med kancellisprog, unødig passiv, lange indskudte sætninger og fagudtryk der kan siges enklere. Behold det faglige indhold præcist — forenkl sproget, ikke sagen. Vis den nye tekst først, og skriv derefter kort hvad du ændrede og hvorfor.",
  },
  {
    key: "grundig",
    name: "Grundig læser",
    description: "Præcis, holder sig til materialet, siger fra.",
    instruction:
      "Vær præcis og forsigtig. Hold dig til det der står i materialet, og skeln tydeligt mellem hvad der står, og hvad du udleder. Skriv det ligeud når grundlaget ikke rækker til et svar, i stedet for at gætte. Henvis til hvor i materialet du har det fra.",
  },
  {
    key: "underviser",
    name: "Underviser",
    description: "Forklarer enkelt, som til en ny kollega.",
    instruction:
      "Forklar som til en ny kollega på første uge. Start med det store billede, før du går i detaljer. Brug et konkret eksempel. Undgå fagudtryk, eller forklar dem første gang de bruges. Slut med at spørge om der er noget der skal uddybes.",
  },
];

export type DefaultTask = {
  group: string;
  name: string;
  description: string;
  prompt: string;
  /** The key of the role the task switches to, or null to leave the role alone. */
  roleKey: string | null;
};

export const DEFAULT_TASKS: DefaultTask[] = [
  {
    group: "Skriv",
    name: "Svar på en henvendelse",
    description: "Venligt og præcist svar til en kunde eller kollega",
    prompt: "Skriv et venligt og præcist svar på henvendelsen. Henvendelsen er:\n\n",
    roleKey: null,
  },
  {
    group: "Skriv",
    name: "Skriv et notat",
    description: "Kort notat med overskrifter",
    prompt: "Skriv et kort notat om følgende. Brug overskrifter og hold det under en side:\n\n",
    roleKey: null,
  },
  {
    group: "Skriv",
    name: "Mødeindkaldelse",
    description: "Formål, dagsorden og forberedelse",
    prompt:
      "Skriv en mødeindkaldelse med formål, dagsorden og hvad deltagerne skal forberede. Mødet handler om:\n\n",
    roleKey: null,
  },
  {
    group: "Skriv",
    name: "Ret sproget igennem",
    description: "Om til klart dansk",
    prompt: "Skriv teksten herunder om til klart dansk:\n\n",
    roleKey: "sprog",
  },
  {
    group: "Læs og forstå",
    name: "Opsummer dokumentet",
    description: "Vedhæft en fil og få hovedpointerne",
    prompt:
      "Opsummer det vedhæftede. Giv mig hovedpointerne, beslutningerne, og hvad jeg skal handle på.",
    roleKey: null,
  },
  {
    group: "Læs og forstå",
    name: "Træk et referat ud",
    description: "Beslutninger, uenigheder og opgaver",
    prompt:
      "Læs referatet og træk ud: hvilke beslutninger blev truffet, hvor var der uenighed, og hvem skal gøre hvad hvornår.",
    roleKey: null,
  },
  {
    group: "Læs og forstå",
    name: "Forklar det enkelt",
    description: "Som til en ny kollega",
    prompt: "Forklar det her, så en ny kollega kan forstå det:\n\n",
    roleKey: "underviser",
  },
  {
    group: "Tænk med",
    name: "Få idéer",
    description: "Mange vinkler at vælge imellem",
    prompt: "Jeg skal bruge idéer til følgende. Giv mig mange forskellige vinkler:\n\n",
    roleKey: "sparring",
  },
  {
    group: "Tænk med",
    name: "Udfordr min plan",
    description: "Find hullerne før andre gør",
    prompt: "Her er min plan. Find hullerne i den:\n\n",
    roleKey: "modspil",
  },
  {
    group: "Tænk med",
    name: "Læs mit udkast kritisk",
    description: "Hvad kan misforstås?",
    prompt: "Læs udkastet herunder som en skeptisk modtager:\n\n",
    roleKey: "kritisk",
  },
  {
    group: "Gør klar",
    name: "Lav en tjekliste",
    description: "Trin i den rigtige rækkefølge",
    prompt:
      "Lav en tjekliste til følgende opgave, med trinnene i den rækkefølge de skal tages:\n\n",
    roleKey: null,
  },
  {
    group: "Gør klar",
    name: "Lav et oplæg",
    description: "Klar til Hent som PowerPoint",
    prompt: "Lav et kort oplæg jeg kan præsentere. Materialet er:\n\n",
    roleKey: null,
  },
];
