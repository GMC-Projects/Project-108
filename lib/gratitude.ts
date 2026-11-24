/**
 * Content for /gratitude: the programme of 1 November and the contributors.
 *
 * Contributors are SAMPLE names until the contribution table is wired in. The
 * real source needs, per row: the name as the contributor wants it shown (or
 * nothing, for an anonymous offering) and an optional dedication. `n` is the
 * contributor's permanent light number, used in share links (#light-n), so it
 * must stay stable once published — order by when the offering was made.
 */

export type Contributor = {
  n: number;
  name: string | null;
  dedication: string | null;
};

/** The night's programme, as published by GMCA. */
// "Before dawn": three lines of thanks to the contributors, read while the
// camera comes down the valley to the site. The last is the gatherings on
// the western bank, waiting, which the raising then sets in motion.
export const TIMELINE: { title: string; text: string }[] = [
  {
    title: "Before the light",
    text: "Long before the first stone was set, 1,265 people had already given — and their giving came to the valley like lamps carried through the night.",
  },
  {
    title: "Many hands",
    text: "Some gave from what they had, some gave their days, some gave only a prayer. Each gift was a stone; together they became a foundation.",
  },
  {
    title: "The gathering",
    text: "On the western bank they waited in the dark, eight gatherings of light, ready to cross the river.",
  },
];

const SAMPLE_COUNT = 1265;

export function getContributors(): Contributor[] {
  // Deterministic, so the server render and every visit agree.
  let seed = 108;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const first = ["Tshering", "Karma", "Pema", "Sonam", "Dorji", "Kinley", "Ugyen", "Jigme", "Dechen", "Tandin", "Yeshi", "Namgay", "Sangay", "Chimi", "Kezang", "Phuntsho", "Anna", "David", "Mei", "Hiroshi", "Priya", "Lucas", "Sofia", "Arjun", "Noor", "Elena"];
  const last = ["Wangmo", "Dorji", "Choden", "Tenzin", "Lhamo", "Zangmo", "Wangchuk", "Yangzom", "Penjor", "Dema", "Gyeltshen", "Norbu", "Tanaka", "Sharma", "Müller", "Chen", "Rossi", "Okafor", "Lindqvist", "Haddad"];
  const deds = [null, null, null, "For all sentient beings", "In memory of my mother", "In memory of my father", "For peace in the world", "For our children", "In honour of my teacher", "For those who are ill", "For the long life of all teachers", "For our family, past and present", "For harmony among all"];

  const out: Contributor[] = [];
  for (let n = 1; n <= SAMPLE_COUNT; n++) {
    const r = rnd();
    const name =
      r < 0.08 ? null : r < 0.16 ? `The ${pick(last)} family` : `${pick(first)} ${pick(last)}`;
    out.push({ n, name, dedication: pick(deds) });
  }
  return out;
}

export function displayName(c: Contributor): string {
  return c.name ?? "An anonymous offering";
}
