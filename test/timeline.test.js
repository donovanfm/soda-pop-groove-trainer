// Timing math for a take: count-in, repeats, and note lengths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GROOVE } from "../src/patterns.js";
import { buildTimeline, secondsPerBeat } from "../src/timeline.js";

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("120 bpm is half a second per beat", () => {
  assert.equal(secondsPerBeat(120), 0.5);
});

test("count-in shifts the first note and marks the count-in clicks", () => {
  const t = buildTimeline({ pattern: GROOVE, feel: "straight", bpm: 120, countInBeats: 4, start: 10 });
  assert.equal(t.clicks.length, 12);
  assert.deepEqual(t.clicks.slice(0, 6).map((c) => c.countIn), [true, true, true, true, false, false]);
  assert.equal(t.patternStart, 12);
  assert.equal(t.notes[0].time, 12);
  assert.equal(t.end, 16);
});

test("downbeat clicks are accented in every bar", () => {
  const t = buildTimeline({ pattern: GROOVE, feel: "straight", bpm: 100, reps: 2 });
  assert.equal(t.clicks.filter((c) => c.accent).length, 4);
});

test("the sixteenth lands 3/4 through the beat straight and 2/3 swung", () => {
  const straight = buildTimeline({ pattern: GROOVE, feel: "straight", bpm: 120 });
  const swung = buildTimeline({ pattern: GROOVE, feel: "swung", bpm: 120 });
  assert.ok(close(straight.notes[3].time, 1.375));
  assert.ok(close(swung.notes[3].time, 1 + 1 / 3));
  // ~42 ms apart at ♩=120: the whole reason this app exists.
  assert.ok(close((straight.notes[3].time - swung.notes[3].time) * 1000, 41.6667, 1e-3));
});

test("repeats tile the groove back to back", () => {
  const t = buildTimeline({ pattern: GROOVE, feel: "straight", bpm: 60, reps: 3 });
  assert.equal(t.notes.length, 30);
  assert.equal(t.notes[10].time, 8);
  assert.equal(t.notes[10].rep, 1);
  assert.equal(t.notes[29].beatIndex, 23);
});

test("staccato notes are short, others ring for most of their value", () => {
  const t = buildTimeline({ pattern: GROOVE, feel: "straight", bpm: 60 });
  const [first, , dotted, sixteenth] = t.notes;
  assert.ok(close(first.duration, 0.22));
  assert.ok(close(dotted.duration, 0.75 * 0.85));
  assert.ok(sixteenth.duration <= 0.25);
});
