// Seed-liste over barer og værtshuse i Aarhus C til kyllingejagten.
//
// VIGTIGT: Åbningstiderne er "best effort" — de er samlet fra barernes egne sider,
// VisitAarhus, Google/Yelp-udtræk og lokale guides, og de kan sagtens være ændret
// siden. Tjek altid selv inden I går derhen, især hvis en bar ser ud til at være
// lukket. Hvor tiden ikke kunne bekræftes, står det i `note`.
//
// Listen er kun et udgangspunkt: flere barer kan tilføjes direkte fra brugerfladen
// mens I er i gang (de gemmes som `custom: true` i server-state, ikke i denne fil).

import type { Bar, OpeningInterval } from "@/lib/types";

/** Kort hjælper, så åbningstiderne kan skrives på én linje per dag. */
const t = (open: string, close: string): OpeningInterval => ({ open, close });

// Nøgler: 0 = søndag, 1 = mandag ... 6 = lørdag.
export const bars: Bar[] = [
  // --- Latinerkvarteret / Mejlgade / Rosensgade / Studsgade -----------------
  {
    id: "under-masken",
    name: "Café Under Masken",
    address: "Bispegade 3, 8000 Aarhus C",
    note: "Klassisk kunstnerværtshus i Latinerkvarteret — masker på væggene.",
    hours: {
      0: t("13:00", "00:00"),
      1: t("12:00", "02:00"),
      2: t("12:00", "02:00"),
      3: t("12:00", "02:00"),
      4: t("12:00", "03:00"),
      5: t("12:00", "03:00"),
      6: t("13:00", "03:00"),
    },
  },
  {
    id: "ris-ras-filliongongong",
    name: "Ris Ras Filliongongong",
    address: "Mejlgade 24, 8000 Aarhus C",
    note: "Belgisk specialøl. Lukker allerede kl. 19 om søndagen.",
    hours: {
      0: t("14:00", "19:00"),
      1: t("12:00", "02:00"),
      2: t("12:00", "02:00"),
      3: t("12:00", "02:00"),
      4: t("12:00", "02:00"),
      5: t("12:00", "03:00"),
      6: t("12:00", "03:00"),
    },
  },
  {
    id: "mig-og-oelsnedkeren",
    name: "Mig & Ølsnedkeren",
    address: "Mejlgade 12, 8000 Aarhus C",
    note: "20 haner med specialøl. Søndag som regel lukket — ikke bekræftet.",
    hours: {
      0: null,
      1: t("14:00", "00:00"),
      2: t("14:00", "00:00"),
      3: t("14:00", "00:00"),
      4: t("14:00", "02:00"),
      5: t("12:00", "02:00"),
      6: t("12:00", "02:00"),
    },
  },
  {
    id: "gyngen",
    name: "Gyngen",
    address: "Mejlgade 53, 8000 Aarhus C",
    note: "Café, spisested og spillested. Lukket mandag og søndag — tjek koncertprogram.",
    hours: {
      0: null,
      1: null,
      2: t("11:00", "00:00"),
      3: t("11:00", "02:00"),
      4: t("11:00", "02:00"),
      5: t("11:00", "02:00"),
      6: t("17:00", "02:00"),
    },
  },
  {
    id: "casablanca",
    name: "Café Casablanca",
    address: "Rosensgade 12, 8000 Aarhus C",
    note: "Åbner tidligt — godt første stop. Lukker dog kl. 15 om søndagen.",
    hours: {
      0: t("09:00", "15:00"),
      1: t("08:30", "00:00"),
      2: t("08:30", "00:00"),
      3: t("08:30", "00:00"),
      4: t("08:30", "00:00"),
      5: t("08:30", "00:00"),
      6: t("09:00", "00:00"),
    },
  },
  {
    id: "pv-kaffe-og-cocktails",
    name: "PV — Kaffe & Cocktails",
    address: "Rosensgade 21, 8000 Aarhus C",
    note: "Cocktailbar ved Pustervig Torv, åbent til kl. 05 i weekenden. Søndag ikke bekræftet.",
    hours: {
      0: null,
      1: t("11:00", "02:00"),
      2: t("11:00", "02:00"),
      3: t("11:00", "02:00"),
      4: t("11:00", "02:00"),
      5: t("11:00", "05:00"),
      6: t("11:00", "05:00"),
    },
  },
  {
    id: "cafe-englen",
    name: "Café Englen",
    address: "Studsgade 3, 8000 Aarhus C",
    note: "Hyggelig stamcafé i Latinerkvarteret — åben hele dagen.",
    hours: {
      0: t("10:00", "23:00"),
      1: t("10:00", "00:00"),
      2: t("10:00", "00:00"),
      3: t("10:00", "00:00"),
      4: t("10:00", "01:00"),
      5: t("10:00", "02:00"),
      6: t("10:00", "02:00"),
    },
  },
  {
    id: "loeves-bog-og-vincafe",
    name: "Løve's Bog- og VinCafé",
    address: "Nørregade 32, 8000 Aarhus C",
    note: "Rolig bog- og vincafé — god til en pause midt i ruten.",
    hours: {
      0: t("10:00", "18:00"),
      1: t("09:00", "23:00"),
      2: t("09:00", "23:00"),
      3: t("09:00", "23:00"),
      4: t("09:00", "00:00"),
      5: t("09:00", "00:00"),
      6: t("10:00", "00:00"),
    },
  },
  {
    id: "apollon",
    name: "Apollon",
    address: "Maren Smeds Gyde 8, 8000 Aarhus C",
    note: "Bar og brunt værtshus med ølkander. Lukker når festen slutter, senest kl. 02. Lukket søndag.",
    hours: {
      0: null,
      1: t("14:00", "02:00"),
      2: t("14:00", "02:00"),
      3: t("14:00", "02:00"),
      4: t("12:00", "02:00"),
      5: t("12:00", "02:00"),
      6: t("12:00", "02:00"),
    },
  },

  // --- Frederiksgade --------------------------------------------------------
  {
    id: "sherlock-holmes-pub",
    name: "Sherlock Holmes Pub",
    address: "Frederiksgade 76 A, 8000 Aarhus C",
    note: "Stor britisk pub med livemusik og sportsbar. Åbner allerede kl. 13 og har åbent til kl. 06 tors-lør.",
    hours: {
      0: t("13:00", "00:00"),
      1: t("13:00", "00:00"),
      2: t("13:00", "04:00"),
      3: t("13:00", "04:00"),
      4: t("13:00", "06:00"),
      5: t("13:00", "06:00"),
      6: t("13:00", "06:00"),
    },
  },
  {
    id: "waxies",
    name: "Waxies",
    address: "Frederiksgade 16, 8000 Aarhus C",
    note: "Irsk pub tæt på åen. Kilderne er uenige om åbningstiderne — ring evt. først.",
    hours: {
      0: t("13:00", "03:00"),
      1: t("12:00", "03:00"),
      2: t("12:00", "03:00"),
      3: t("12:00", "03:00"),
      4: t("12:00", "03:00"),
      5: t("12:00", "05:00"),
      6: t("12:00", "05:00"),
    },
  },
  {
    id: "tir-na-nog",
    name: "Tir na nÓg",
    address: "Frederiksgade 40, 8000 Aarhus C",
    note: "Irsk gastropub — god til sport på storskærm.",
    hours: {
      0: t("12:00", "02:00"),
      1: t("15:00", "02:00"),
      2: t("15:00", "02:00"),
      3: t("15:00", "02:00"),
      4: t("15:00", "02:00"),
      5: t("13:00", "04:00"),
      6: t("12:00", "04:00"),
    },
  },

  // --- Åboulevarden ---------------------------------------------------------
  {
    id: "herr-bartels",
    name: "Herr Bartels",
    address: "Åboulevarden 46, 8000 Aarhus C",
    note: "Cocktailbar med DJ. Åbner først kl. 20 og kun torsdag-lørdag — planlæg den sent på aftenen.",
    hours: {
      0: null,
      1: null,
      2: null,
      3: null,
      4: t("20:00", "01:00"),
      5: t("20:00", "03:00"),
      6: t("20:00", "03:00"),
    },
  },
  {
    id: "cafe-faust",
    name: "Café Faust",
    address: "Åboulevarden 38, 8000 Aarhus C",
    note: "Café og bar midt på Åboulevarden — åbner om formiddagen.",
    hours: {
      0: t("09:00", "23:00"),
      1: t("09:30", "23:00"),
      2: t("09:30", "23:00"),
      3: t("09:30", "00:00"),
      4: t("09:30", "01:00"),
      5: t("09:30", "02:00"),
      6: t("09:00", "02:00"),
    },
  },

  // --- Klostertorvet / Klostergade -----------------------------------------
  {
    id: "cafe-smagloes",
    name: "Café Smagløs",
    address: "Klostertorvet 7, 8000 Aarhus C",
    note: "Klassisk café på Klostertorvet med både mad, øl og cocktails.",
    hours: {
      0: t("11:00", "23:00"),
      1: t("11:00", "23:00"),
      2: t("11:00", "23:00"),
      3: t("11:00", "23:00"),
      4: t("11:00", "02:00"),
      5: t("11:00", "02:00"),
      6: t("11:00", "02:00"),
    },
  },
  {
    id: "zanders",
    name: "Zanders",
    address: "Klostertorv 5, 8000 Aarhus C",
    note: "Bar ved Vor Frue Kirke. Søndag som regel lukket — ikke bekræftet.",
    hours: {
      0: null,
      1: t("11:00", "23:00"),
      2: t("11:00", "23:00"),
      3: t("11:00", "23:00"),
      4: t("11:00", "02:00"),
      5: t("11:00", "03:00"),
      6: t("10:00", "03:00"),
    },
  },
  {
    id: "fairbar",
    name: "Fairbar",
    address: "Klostertorvet 6, 8000 Aarhus C",
    note: "Non-profit bar med mange gratis events. Åbningstid ikke bekræftet.",
    hours: {
      0: null,
      1: t("12:00", "00:00"),
      2: t("12:00", "00:00"),
      3: t("12:00", "00:00"),
      4: t("12:00", "00:00"),
      5: t("12:00", "02:00"),
      6: t("12:00", "02:00"),
    },
  },
  {
    id: "hornsleth-bar",
    name: "Hornsleth Bar",
    address: "Klostergade 32, 8000 Aarhus C",
    note: "Cocktailbar og natklub — kun fredag og lørdag, og først sent. Åbningstid ikke bekræftet.",
    hours: {
      0: null,
      1: null,
      2: null,
      3: null,
      4: null,
      5: t("22:00", "05:00"),
      6: t("22:00", "05:00"),
    },
  },

  // --- Skolegade ------------------------------------------------------------
  {
    id: "escobar",
    name: "EscoBar",
    address: "Skolegade 32, 8000 Aarhus C",
    note: "Rock- og metalbar med quiz om mandagen. Kilderne er uenige om åbningstiderne.",
    hours: {
      0: t("18:00", "02:00"),
      1: t("18:00", "02:00"),
      2: t("18:00", "02:00"),
      3: t("18:00", "02:00"),
      4: t("18:00", "03:00"),
      5: t("16:00", "04:00"),
      6: t("16:00", "04:00"),
    },
  },
  {
    id: "pinds-cafe",
    name: "Pind's Café",
    address: "Skolegade 11, 8000 Aarhus C",
    note: "Aarhus' ældste værtshus (1936), i dag også cocktailbar. Lukket søndag-tirsdag.",
    hours: {
      0: null,
      1: null,
      2: null,
      3: t("16:00", "00:00"),
      4: t("16:00", "01:00"),
      5: t("16:00", "03:00"),
      6: t("16:00", "03:00"),
    },
  },
  {
    id: "gbar",
    name: "G-Bar",
    address: "Skolegade 28, 8000 Aarhus C",
    note: "LGBT-natklub — åbner først sent og kun i weekenden. Åbningstid ikke bekræftet.",
    hours: {
      0: null,
      1: null,
      2: null,
      3: null,
      4: null,
      5: t("23:00", "05:00"),
      6: t("23:00", "05:00"),
    },
  },

  // --- Vestergade -----------------------------------------------------------
  {
    id: "casa-v58",
    name: "Casa V58",
    address: "Vestergade 58, 8000 Aarhus C",
    note: "Spillested og bar i Vestergade. Åbningstid ikke bekræftet — følger koncertprogrammet.",
    hours: {
      0: null,
      1: null,
      2: null,
      3: t("16:00", "00:00"),
      4: t("16:00", "02:00"),
      5: t("16:00", "03:00"),
      6: t("16:00", "03:00"),
    },
  },

  // --- Jægergårdsgade / Frederiksbjerg -------------------------------------
  {
    id: "st-pauls-apothek",
    name: "St. Pauls Apothek",
    address: "Jægergårdsgade 76, 8000 Aarhus C",
    note: "Cocktailbar og restaurant i det gamle apotek. Åbner først 17.30, lukket søndag og mandag.",
    hours: {
      0: null,
      1: null,
      2: t("17:30", "00:00"),
      3: t("17:30", "00:00"),
      4: t("17:30", "00:00"),
      5: t("17:30", "02:00"),
      6: t("17:30", "02:00"),
    },
  },
  {
    id: "mikkeller-bar-aarhus",
    name: "Mikkeller Bar Aarhus",
    address: "Jægergårdsgade 61, 8000 Aarhus C",
    note: "Specialøl tæt på banegården. Kilderne er uenige om mandag og søndag.",
    hours: {
      0: t("14:00", "20:00"),
      1: null,
      2: t("16:00", "22:00"),
      3: t("16:00", "22:00"),
      4: t("16:00", "00:00"),
      5: t("14:00", "01:00"),
      6: t("12:00", "01:00"),
    },
  },

  // --- Godsbanen ------------------------------------------------------------
  {
    id: "institut-for-x",
    name: "Institut for (X)",
    address: "Exners Plads 9, 8000 Aarhus C",
    note: "Alternativ barkultur på Godsbanen. Åbningstid ikke bekræftet — varierer meget med events.",
    hours: {
      0: null,
      1: null,
      2: null,
      3: t("16:00", "00:00"),
      4: t("16:00", "02:00"),
      5: t("16:00", "03:00"),
      6: t("16:00", "03:00"),
    },
  },
];
