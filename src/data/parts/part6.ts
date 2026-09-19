// Del 6 af seed-listen: de sidste 7 steder på den officielle liste (nr. 100-106).
//
// Åbningstiderne er tjekket 19-09-2026 mod stedernes egne sider, Aarhus Street
// Foods officielle side, beerwalk.dk og lokale Aarhus-guider. Hvor kilderne er
// uenige, eller hvor tiden ikke kunne bekræftes, står det i `note`.
//
// Nøgler: 0 = søndag, 1 = mandag ... 6 = lørdag.

import type { Bar } from "@/lib/types";

/** Kort hjælper, så åbningstiderne kan skrives på én linje per dag. */
const t = (open: string, close: string) => ({ open, close });

export const barsPart6: Bar[] = [
  {
    id: "willys",
    name: "Willy's",
    address: "Åboulevarden 39, 8000 Aarhus C",
    note: "Rå bodega ved åen med rafling og bordfodbold. Lukket søndag. Kilderne er uenige om fredagen (nogle siger åbent fra 14.30) — lørdag åbner den til gengæld allerede 14.30 og har åbent til kl. 04.",
    hours: {
      0: null,
      1: t("17:00", "02:00"),
      2: t("17:00", "02:00"),
      3: t("17:00", "02:00"),
      4: t("17:00", "02:00"),
      5: t("17:00", "04:00"),
      6: t("14:30", "04:00"),
    },
  },
  {
    id: "yoyo",
    name: "Yoyo",
    address: "Vestergade 1, 8000 Aarhus C",
    note: "80'er/90'er-café og bar — åbner kl. 08 hver dag, så den er åben hele eftermiddagen. Discokugle og hjemmelavede shots om aftenen.",
    hours: {
      0: t("08:00", "00:00"),
      1: t("08:00", "00:00"),
      2: t("08:00", "00:00"),
      3: t("08:00", "00:00"),
      4: t("08:00", "01:00"),
      5: t("08:00", "02:00"),
      6: t("08:00", "02:00"),
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
    id: "aeblet-og-gaasen",
    name: "Æblet og Gåsen",
    address: "Jægergårdsgade 83, 8000 Aarhus C",
    note: "Røgfrit værtshus med 50+ øl, dart og brætspil. Åbner først kl. 15 man-tors, men allerede kl. 13 fre-søn. NB: lukker kl. 18 om søndagen.",
    hours: {
      0: t("13:00", "18:00"),
      1: t("15:00", "22:00"),
      2: t("15:00", "22:00"),
      3: t("15:00", "22:00"),
      4: t("15:00", "22:00"),
      5: t("13:00", "02:00"),
      6: t("13:00", "02:00"),
    },
  },
  {
    id: "oelbaren",
    name: "Ølbaren",
    address: "Ny Banegårdsgade 46, 8000 Aarhus C",
    note: "Ølbaren inde i Aarhus Street Food — 32 haner og 140+ specialøl. Følger hallens tider: åbner 11.30 hver dag, og baren har åbent til midnat fre og lør. Forveksl ikke med Ølbaren på Elmegade i København, som har helt andre tider.",
    hours: {
      0: t("11:30", "21:00"),
      1: t("11:30", "21:00"),
      2: t("11:30", "21:00"),
      3: t("11:30", "21:00"),
      4: t("11:30", "21:00"),
      5: t("11:30", "00:00"),
      6: t("11:30", "00:00"),
    },
  },
  {
    id: "aaben-aarhus",
    name: "ÅBEN Aarhus",
    address: "Rosensgade 28, 8000 Aarhus C",
    note: "Bryggeriets taproom i Latinerkvarteret med 24 haner. Åbner kl. 14 (13 i weekenden) — godt eftermiddagsstop. Lukker tidligt søndag kl. 21.",
    hours: {
      0: t("14:00", "21:00"),
      1: t("14:00", "23:00"),
      2: t("14:00", "00:00"),
      3: t("14:00", "00:00"),
      4: t("14:00", "00:00"),
      5: t("13:00", "02:00"),
      6: t("13:00", "02:00"),
    },
  },
  {
    id: "aarhus-street-food",
    name: "Aarhus Street Food",
    address: "Ny Banegårdsgade 46, 8000 Aarhus C",
    note: "Madhal med egne barer — åbner 11.30 hver dag og er dermed et oplagt første stop. Køkkenerne lukker 21 (22 fre/lør), men barerne holder åbent til midnat fre og lør. Kaffebaren åbner allerede kl. 09.",
    hours: {
      0: t("11:30", "21:00"),
      1: t("11:30", "21:00"),
      2: t("11:30", "21:00"),
      3: t("11:30", "21:00"),
      4: t("11:30", "21:00"),
      5: t("11:30", "00:00"),
      6: t("11:30", "00:00"),
    },
  },
];
