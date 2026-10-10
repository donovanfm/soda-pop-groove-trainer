/*
 * patterns.js — the rhythms this app drills, in two "feels".
 *
 * Source: the Soda Pop section (♩ = 120, mm. 47–62) of Jack Aguirre's
 * KPop Demon Hunters Medley for clarinet choir. The contra-alto,
 * contrabass, and B♭ 3 parts carry a two-bar groove:
 *
 *   m. 47 ("call")    ♪ 𝄾 | ♪ 𝄾 | ♪. ♬ | 𝄽         (heard as ♩ ♩ ♪.♬ 𝄽)
 *   m. 48 ("answer")  ♪.♬ | 𝄾 ♪ | ♪.♬ | 𝄾 ♪
 *
 * The section problem is that some players swing it: the 16th slides
 * from 3/4 of the way through the beat to 2/3 (a quarter-eighth
 * triplet), and in m. 48 the off-beat eighths drift from 1/2 to 2/3.
 * Each pattern therefore carries a "straight" notation (as written) and
 * a "swung" notation (what the swingers are actually playing). The two
 * have the same notes in the same order; only the off-beat positions
 * differ, which is what lets scoring compare a tap to both targets.
 *
 * Notation is stored as bars → beats → tokens so the same data drives
 * playback (onset math here), the SVG engraver (notation.js) and tap
 * scoring (scoring.js). Pitches are concert pitch, an octave above the
 * real bass line so they speak on laptop and phone speakers.
 */

export const FEELS = Object.freeze(["straight", "swung"]);

/** Written duration of each token type, in beats (quarter = 1). */
export const DURATION_BEATS = Object.freeze({
  "4": 1,
  "8": 1 / 2,
  "8.": 3 / 4,
  "16": 1 / 4,
  "4t": 2 / 3,
  "8t": 1 / 3,
});

const n = (d, marks = {}) => ({ d, ...marks });
const r = (d) => ({ d, rest: true });
const ACC = { accent: true };
const STAC = { staccato: true };
const ACC_STAC = { accent: true, staccato: true };

const C4 = 60, G3 = 55, F3 = 53, E3 = 52;

const CALL = {
  straight: [
    [n("8", ACC_STAC), r("8")],
    [n("8", ACC_STAC), r("8")],
    [n("8.", ACC), n("16", STAC)],
    [r("4")],
  ],
  swung: [
    [n("8", ACC_STAC), r("8")],
    [n("8", ACC_STAC), r("8")],
    [n("4t", ACC), n("8t", STAC)],
    [r("4")],
  ],
  pitches: [C4, C4, C4, C4],
};

const ANSWER = {
  straight: [
    [n("8.", ACC), n("16", ACC_STAC)],
    [r("8"), n("8", STAC)],
    [n("8.", ACC), n("16", ACC_STAC)],
    [r("8"), n("8", STAC)],
  ],
  swung: [
    [n("4t", ACC), n("8t", ACC_STAC)],
    [r("4t"), n("8t", STAC)],
    [n("4t", ACC), n("8t", ACC_STAC)],
    [r("4t"), n("8t", STAC)],
  ],
  pitches: [G3, G3, G3, F3, F3, E3],
};

export const PATTERNS = Object.freeze([
  {
    id: "call",
    label: "m. 47",
    name: "The call",
    bars: [CALL],
  },
  {
    id: "answer",
    label: "m. 48",
    name: "The answer",
    bars: [ANSWER],
  },
  {
    id: "groove",
    label: "mm. 47–48",
    name: "Full groove",
    bars: [CALL, ANSWER],
  },
]);

export function getPattern(id) {
  const pattern = PATTERNS.find((p) => p.id === id);
  if (!pattern) throw new Error(`Unknown pattern "${id}"`);
  return pattern;
}

export function patternLengthBeats(pattern) {
  return pattern.bars.length * 4;
}

/**
 * Flattens a pattern into its sounding notes for one feel.
 * `beat` is measured from the start of the pattern; `frac` is the
 * position inside its beat (0 = on the beat), which is what the
 * straight/swung comparison is about.
 */
export function soundingNotes(pattern, feel) {
  if (!FEELS.includes(feel)) throw new Error(`Unknown feel "${feel}"`);
  const notes = [];
  pattern.bars.forEach((bar, barIndex) => {
    let pitchIndex = 0;
    bar[feel].forEach((tokens, beatInBar) => {
      let pos = 0;
      for (const token of tokens) {
        const length = DURATION_BEATS[token.d];
        if (!token.rest) {
          const beatIndex = barIndex * 4 + beatInBar;
          notes.push({
            index: notes.length,
            beat: beatIndex + pos,
            beatIndex,
            frac: pos,
            length,
            accent: Boolean(token.accent),
            staccato: Boolean(token.staccato),
            pitch: bar.pitches[pitchIndex++],
          });
        }
        pos += length;
      }
    });
  });
  return notes;
}

/** The one the player is NOT being asked about, for A/B comparisons. */
export function otherFeel(feel) {
  return feel === "straight" ? "swung" : "straight";
}
