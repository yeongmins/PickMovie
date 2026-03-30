// frontend/src/assets/ages/index.ts
import ageAll from "./ALL.png";
import age12 from "./12.png";
import age15 from "./15.png";
import age18 from "./18.png";

export type AgeKey = "ALL" | "12" | "15" | "18";

export const AGE_BADGE_SRC: Record<AgeKey, string> = {
  ALL: ageAll,
  "12": age12,
  "15": age15,
  "18": age18,
};
