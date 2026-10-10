/*
 * scoring.js — grades a tapped take against the written rhythm.
 *
 * Inputs are the straight (target) and swung timelines for the same
 * take plus the tap times, all on one clock. Output is an overall
 * score, per-note timing errors, and a "swing index" for every off-beat
 * note: 0 means the tap sat exactly where the score puts it, 1 means it
 * sat on the triplet partial the swingers use. That index is the number
 * that answers the section's actual question ("am I swinging it?").
 *
 * Latency: touchscreens, Bluetooth speakers and keyboards add a fixed
 * delay we can't see. Instead of a calibration step, we take the median
 * error of the on-beat notes (the ones nobody disagrees about) as the
 * player's constant offset and grade everything relative to it. The
 * swing index is immune to that offset anyway because it compares
 * positions inside a beat.
 */

/** Errors at or under this get full credit. */
export const PERFECT_MS = 20;
/** Errors at or over this get no credit. */
export const ZERO_CREDIT_MS = 100;
/** An extra tap costs half of one note's credit. */
const EXTRA_TAP_PENALTY = 0.5;
/** Fewer on-beat matches than this and we don't trust an offset estimate. */
const MIN_NOTES_FOR_OFFSET = 2;

export function creditForError(errorMs) {
  const abs = Math.abs(errorMs);
  if (abs <= PERFECT_MS) return 1;
  if (abs >= ZERO_CREDIT_MS) return 0;
  return 1 - (abs - PERFECT_MS) / (ZERO_CREDIT_MS - PERFECT_MS);
}

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Each target claims at most one tap: the nearest one that is nearer to
 * it than to any other target. Leftover taps are extras.
 */
export function matchTaps(targetTimes, tapTimes) {
  const claimed = new Array(targetTimes.length).fill(null);
  const extras = [];
  for (const tap of tapTimes) {
    let best = -1;
    let bestDistance = Infinity;
    targetTimes.forEach((time, i) => {
      const distance = Math.abs(tap - time);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    if (best < 0) {
      extras.push(tap);
    } else if (claimed[best] === null) {
      claimed[best] = tap;
    } else if (Math.abs(tap - targetTimes[best]) < Math.abs(claimed[best] - targetTimes[best])) {
      extras.push(claimed[best]);
      claimed[best] = tap;
    } else {
      extras.push(tap);
    }
  }
  return { claimed, extras };
}

export function swingVerdict(swingIndex) {
  if (swingIndex === null) return "none";
  if (swingIndex < 1 / 3) return "straight";
  if (swingIndex > 2 / 3) return "swung";
  return "between";
}

/**
 * @param {object} take
 * @param {Array} take.straight  timeline.notes for the straight feel (the target)
 * @param {Array} take.swung     timeline.notes for the swung feel, same take
 * @param {number[]} take.taps   tap times on the same clock
 * @param {number} take.spb      seconds per beat
 */
export function scoreTake({ straight, swung, taps, spb }) {
  if (straight.length !== swung.length) throw new Error("Feels must have matching notes");
  if (straight.length === 0) throw new Error("Nothing to score");

  // Ignore anything tapped well before the first note (tapping along to
  // the count-in) or well after the last.
  const windowStart = straight[0].time - spb / 2;
  const windowEnd = straight[straight.length - 1].time + spb / 2;
  const inWindow = taps.filter((t) => t >= windowStart && t <= windowEnd);

  const targetTimes = straight.map((n) => n.time);
  const firstPass = matchTaps(targetTimes, inWindow);
  const onBeatErrors = straight
    .map((note, i) => (note.frac === 0 && firstPass.claimed[i] !== null ? firstPass.claimed[i] - note.time : null))
    .filter((e) => e !== null);
  const offset = onBeatErrors.length >= MIN_NOTES_FOR_OFFSET ? median(onBeatErrors) : 0;

  // Re-match with latency removed so a laggy device can't push taps
  // into the neighbouring note's territory.
  const corrected = inWindow.map((t) => t - offset);
  const { claimed, extras } = matchTaps(targetTimes, corrected);

  const notes = straight.map((note, i) => {
    const tap = claimed[i];
    const offBeat = note.frac !== 0;
    if (tap === null) {
      return { index: i, beat: note.beat, frac: note.frac, offBeat, tap: null, errorMs: null, credit: 0, swing: null };
    }
    const errorMs = (tap - note.time) * 1000;
    const swingSpan = swung[i].time - note.time;
    const swing = offBeat && swingSpan !== 0 ? (tap - note.time) / swingSpan : null;
    return { index: i, beat: note.beat, frac: note.frac, offBeat, tap, errorMs, credit: creditForError(errorMs), swing };
  });

  const hit = notes.filter((n) => n.tap !== null);
  const earned = notes.reduce((sum, n) => sum + n.credit, 0);
  const possible = notes.length + extras.length * EXTRA_TAP_PENALTY;
  const swingValues = notes.filter((n) => n.swing !== null).map((n) => n.swing);
  const swingIndex = swingValues.length ? swingValues.reduce((a, b) => a + b, 0) / swingValues.length : null;

  return {
    score: Math.round((100 * earned) / possible),
    offsetMs: offset * 1000,
    meanAbsErrorMs: hit.length ? hit.reduce((s, n) => s + Math.abs(n.errorMs), 0) / hit.length : null,
    hits: hit.length,
    misses: notes.length - hit.length,
    extras: extras.length,
    swingIndex,
    verdict: swingVerdict(swingIndex),
    notes,
  };
}
