// Personality affects motion only. Genetically inherited proportions stay intact.
export const BEHAVIORS = [
  { speed: 1.7, chance: .82, rest: 1.4, bounce: .17, sway: .08, tail: .42 },
  { speed: .75, chance: .28, rest: 5, bounce: .04, sway: .02, tail: .08 },
  { speed: 1.15, chance: .6, rest: 2.6, bounce: .08, sway: .1, tail: .35 },
  { speed: .85, chance: .35, rest: 4, bounce: .04, sway: .025, tail: .14 },
  { speed: 1.25, chance: .75, rest: 2, bounce: .09, sway: .07, tail: .3 },
  { speed: .6, chance: .2, rest: 8, bounce: .025, sway: .02, tail: .06 },
  { speed: 1.5, chance: .85, rest: 1.8, bounce: .2, sway: .12, tail: .48 },
  { speed: 1.3, chance: .45, rest: 3, bounce: .06, sway: .035, tail: .22 },
];
export const behaviorOf = c => BEHAVIORS[c.personality] ?? { speed: .8, chance: .5, rest: 3, bounce: .1, sway: .06, tail: .2 };
