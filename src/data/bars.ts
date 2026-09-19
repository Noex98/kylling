// Barlisten til aftenens kyllingejagt — 106 steder fra Facebook-begivenheden.
// (105 i praksis: "Two Socks Aarhus" står to gange på listen, som #88 og #89.)
//
// Åbningstiderne er best effort og bør dobbelttjekkes for de steder der er
// markeret med en note om at tiden ikke er bekræftet. Barer kan også tilføjes
// direkte i appen undervejs.
//
// Listen er delt op i filer under ./parts/ så den er til at arbejde med.
// Rækkefølgen her er den alfabetiske fra begivenheden; appen sorterer selv.

import type { Bar } from "@/lib/types";

import { barsPart1 } from "./parts/part1";
import { barsPart2 } from "./parts/part2";
import { barsPart3 } from "./parts/part3";
import { barsPart4 } from "./parts/part4";
import { barsPart5 } from "./parts/part5";
import { barsPart6 } from "./parts/part6";

export const bars: Bar[] = [
  ...barsPart1,
  ...barsPart2,
  ...barsPart3,
  ...barsPart4,
  ...barsPart5,
  ...barsPart6,
];
