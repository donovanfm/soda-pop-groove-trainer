/*
 * timeline.js — turns a pattern + tempo into absolute, seconds-based
 * events (notes and metronome clicks) for one take.
 *
 * Pure and clock-agnostic: `start` is whatever clock the caller uses
 * (AudioContext.currentTime in the browser, plain numbers in tests).
 * audio.js schedules the result; scoring.js compares taps against the
 * very same note times, so what you hear and what you're graded on can
 * never drift apart.
 */

import { patternLengthBeats, soundingNotes } from "./patterns.js";

/** Staccato notes ring for this fraction of an eighth; others for most of their value. */
const STACCATO_BEATS = 0.22;
const LEGATO_FILL = 0.85;

export function secondsPerBeat(bpm) {
  return 60 / bpm;
}

/**
 * @param {object} opts
 * @param {object} opts.pattern       from patterns.js
 * @param {"straight"|"swung"} opts.feel
 * @param {number} opts.bpm
 * @param {number} [opts.reps=1]       times through the pattern
 * @param {number} [opts.countInBeats=0]
 * @param {number} [opts.start=0]      clock time of the first count-in click
 */
export function buildTimeline({ pattern, feel, bpm, reps = 1, countInBeats = 0, start = 0 }) {
  const spb = secondsPerBeat(bpm);
  const patternBeats = patternLengthBeats(pattern);
  const totalBeats = countInBeats + patternBeats * reps;
  const firstNoteBeat = countInBeats;

  const clicks = [];
  for (let b = 0; b < totalBeats; b++) {
    const inCountIn = b < countInBeats;
    const beatInBar = inCountIn ? b : (b - countInBeats) % 4;
    clicks.push({ time: start + b * spb, accent: beatInBar === 0, countIn: inCountIn });
  }

  const shape = soundingNotes(pattern, feel);
  const notes = [];
  for (let rep = 0; rep < reps; rep++) {
    for (const note of shape) {
      const beat = rep * patternBeats + note.beat;
      const ringBeats = note.staccato ? Math.min(STACCATO_BEATS, note.length) : note.length * LEGATO_FILL;
      notes.push({
        ...note,
        rep,
        beat,
        beatIndex: rep * patternBeats + note.beatIndex,
        time: start + (firstNoteBeat + beat) * spb,
        duration: ringBeats * spb,
      });
    }
  }

  return {
    bpm,
    spb,
    start,
    patternStart: start + firstNoteBeat * spb,
    end: start + totalBeats * spb,
    clicks,
    notes,
  };
}
