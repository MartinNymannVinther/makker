/* ==========================================================================
   PII-filter — kører udelukkende i browseren.

   Beskeden scannes her på maskinen, før den sendes. Intet af det filteret
   finder forlader enheden, og filen taler aldrig med serveren.

   Der er to slags fund, og forskellen er vigtig:

     FUND   et genkendt format — CPR, mail, kontonummer. Præcist nok til
            at blokere afsendelsen.

     VINK   ord der ofte følger med særlige kategorier efter GDPR artikel 9,
            fx helbred. Det er et skøn, ikke et match, så det blokerer ikke
            af sig selv. Ellers ville filteret råbe op hver gang nogen
            skriver "sygemeldt", og så holder folk op med at læse det.

   Filteret kan ikke opregne alle GDPR-problemer. Det kender ikke jeres
   behandlingsgrundlag og kan ikke se navne eller helbredsoplysninger
   skrevet frit i teksten. Det er en påmindelse, ikke en garanti.
   ========================================================================== */

const PII = (function () {

  /* ------------------------------------------------------------------
     MØNSTRE — genkendte formater. Det er her man tilføjer flere.

       navn    hvad brugeren får at se
       regex   skal have flaget g
       gruppe  valgfri: hvilken indfangning der er selve fundet
       tjek    valgfri ekstra kontrol (match => true/false)

     Rækkefølgen er prioriteret: det første mønster der rammer et stykke
     tekst vinder, så et CPR-nummer ikke også meldes som noget andet.
     ------------------------------------------------------------------ */

  const MØNSTRE = [
    {
      navn: "Muligt CPR-nummer",
      // Med bindestreg på CPR-pladsen er signalet så stærkt i sig selv, at
      // vi ikke også kræver en gyldig fødselsdato. Testnumre har sjældent
      // en, og et misset CPR-nummer er værre end en falsk alarm.
      regex: /\b\d{6}-\d{4}\b/g,
    },
    {
      navn: "Muligt CPR-nummer",
      // Uden bindestreg kræver vi gyldig dag og måned — ellers ville
      // ethvert titencifret tal blive meldt.
      regex: /\b(\d{2})(\d{2})(\d{2})(\d{4})\b/g,
      tjek: (m) => gyldigDato(m[1], m[2]),
    },
    {
      navn: "Muligt kreditkortnummer",
      regex: /\b(?:\d[ -]?){12,18}\d\b/g,
      tjek: (m) => luhn(kunCifre(m[0])),
    },
    {
      navn: "Muligt IBAN-nummer",
      regex: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
      tjek: (m) => iban97(m[0]),
    },
    {
      navn: "Muligt kontonummer",
      // Dansk reg.nr. + kontonummer, fx "1234 5678901"
      regex: /\b\d{4}[ -]\d{6,10}\b/g,
    },
    {
      navn: "Mulig e-mailadresse",
      regex: /\b[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+\b/g,
    },
    {
      navn: "Muligt telefonnummer",
      // Dansk nummer: 8 cifre der starter med 2-9. Enten står der +45
      // foran, ellers må der ikke stå cifre op ad det — uden den vagt
      // fisker mønsteret 8 cifre ud af midten af et kortnummer.
      regex: /(?:\+45[ ]?|(?<!\d)(?<!\d[ ]))[2-9](?:[ ]?\d){7}(?!\d)(?![ ]\d)/g,
    },
    {
      navn: "Mulig diagnosekode",
      // ICD-10. Enten dansk form med D foran (DF432) eller med decimal
      // (F43.2). Et bogstav plus to cifre alene er for løst — "B12" er
      // lige så ofte en vitamin som en diagnose.
      regex: /\b(?:D[A-Z]\d{2}\d?|[A-Z]\d{2}\.\d{1,2})\b/g,
    },
    {
      navn: "Muligt navn",
      // Kun når nogen præsenterer sig. At gætte navne frit i dansk tekst
      // giver alt for mange falske alarmer — ethvert ord først i en
      // sætning har stort begyndelsesbogstav.
      regex: /(?:[Jj]eg hedder|[Mm]it navn er|[Uu]ndertegnede er)\s+([A-ZÆØÅ][a-zæøå]+(?:[ -][A-ZÆØÅ][a-zæøå]+){0,2})/g,
      gruppe: 1,
    },
  ];

  /* ------------------------------------------------------------------
     VINK — ord der peger på særlige kategorier efter GDPR artikel 9.

     Listerne er bevidst korte og specifikke. "behandling" og "stress"
     står der ikke, for de bruges hele tiden i almindelig sagstekst, og
     et filter der advarer om alt bliver ignoreret.
     ------------------------------------------------------------------ */

  const VINK = [
    {
      navn: "Helbredsoplysninger",
      forklaring: "Helbred er en særlig kategori efter GDPR artikel 9 og "
                + "kræver et strengere grundlag end almindelige oplysninger.",
      ord: ["sygemeldt", "sygemelding", "sygemeldingen", "sygdom", "diagnose",
            "diagnosen", "diagnosticeret", "lægeerklæring", "læge", "lægen",
            "psykiater", "psykolog", "indlagt", "depression", "angst",
            "kronisk", "recept", "helbred", "helbredet", "journal"],
    },
    {
      navn: "Fagforeningsforhold",
      forklaring: "Fagforeningsmedlemskab er også en særlig kategori efter "
                + "artikel 9.",
      ord: ["fagforening", "fagforeningen", "tillidsrepræsentant",
            "tillidsmand", "overenskomstforhandling"],
    },
  ];

  /* ------------------------------------------------------------------
     Indstillinger. Sættes af app.js ud fra det administrator har valgt.
     Indtil de er hentet, er alt slået til — det er den sikre tilstand.
     ------------------------------------------------------------------ */

  let opsætning = { slåetFra: [], ekstraOrd: {} };

  function konfigurer(nyt) {
    opsætning = {
      slåetFra: (nyt && nyt.slåetFra) || [],
      ekstraOrd: (nyt && nyt.ekstraOrd) || {},
    };
  }

  const aktivt = (navn) => !opsætning.slåetFra.includes(navn);

  /* ------------------------------------------------------------------
     Hjælpetjek — holder antallet af falske alarmer nede.
     ------------------------------------------------------------------ */

  const kunCifre = (s) => s.replace(/\D/g, "");

  function gyldigDato(dag, måned) {
    const d = +dag, m = +måned;
    return d >= 1 && d <= 31 && m >= 1 && m <= 12;
  }

  // Luhn: kontrolciffer-algoritmen alle betalingskort bruger.
  function luhn(cifre) {
    if (cifre.length < 13 || cifre.length > 19) return false;
    let sum = 0, dobbelt = false;
    for (let i = cifre.length - 1; i >= 0; i--) {
      let n = +cifre[i];
      if (dobbelt) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      dobbelt = !dobbelt;
    }
    return sum % 10 === 0;
  }

  // IBAN mod-97: flyt de fire første tegn bagest, lav bogstaver om til tal,
  // og divider. Går det op i 1, er kontrolcifrene rigtige.
  function iban97(rå) {
    const s = rå.replace(/\s/g, "").toUpperCase();
    if (s.length < 15 || s.length > 34) return false;
    const flyttet = s.slice(4) + s.slice(0, 4);
    let rest = 0;
    for (const tegn of flyttet) {
      const værdi = /[A-Z]/.test(tegn) ? tegn.charCodeAt(0) - 55 : +tegn;
      if (Number.isNaN(værdi)) return false;
      rest = (rest * (værdi > 9 ? 100 : 10) + værdi) % 97;
    }
    return rest === 1;
  }

  /* ------------------------------------------------------------------
     Scanningen.
     ------------------------------------------------------------------ */

  function findFund(tekst) {
    const fund = [];

    for (const mønster of MØNSTRE) {
      if (!aktivt(mønster.navn)) continue;
      mønster.regex.lastIndex = 0;
      let m;
      while ((m = mønster.regex.exec(tekst)) !== null) {
        // Tomme match ville få løkken til at køre i ring.
        if (m[0] === "") { mønster.regex.lastIndex++; continue; }
        if (mønster.tjek && !mønster.tjek(m)) continue;

        // Er der peget på en indfangning, er det den der er selve fundet.
        const del = mønster.gruppe ? m[mønster.gruppe] : m[0];
        if (!del) continue;
        const start = m.index + (mønster.gruppe ? m[0].indexOf(del) : 0);
        const slut = start + del.length;

        // Overlapper fundet noget vi allerede har taget, vinder det første
        // mønster i listen — det er det mest specifikke.
        if (fund.some((f) => start < f.slut && slut > f.start)) continue;

        fund.push({ navn: mønster.navn, tekst: del, start, slut });
      }
    }

    return fund.sort((a, b) => a.start - b.start);
  }

  function findVink(tekst) {
    const resultat = [];
    for (const gruppe of VINK) {
      if (!aktivt(gruppe.navn)) continue;
      const ord = gruppe.ord.concat(opsætning.ekstraOrd[gruppe.navn] || []);
      const ramt = ord.filter((o) =>
        new RegExp("\\b" + o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i")
          .test(tekst));
      if (ramt.length) {
        resultat.push({ navn: gruppe.navn, forklaring: gruppe.forklaring,
                        ord: ramt });
      }
    }
    return resultat;
  }

  /**
   * Scan en tekst.
   * @returns {{fund: Array, vink: Array}} fund blokerer, vink oplyser
   */
  function scan(tekst) {
    if (!tekst) return { fund: [], vink: [] };
    return { fund: findFund(tekst), vink: findVink(tekst) };
  }

  // Navnene bruges af indstillingssiden til at liste hvad der kan slås fra.
  const alleNavne = () =>
    [...new Set(MØNSTRE.map((m) => m.navn))].concat(VINK.map((v) => v.navn));

  return { scan, konfigurer, alleNavne, MØNSTRE, VINK };
})();
