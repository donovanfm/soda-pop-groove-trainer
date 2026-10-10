// Tap grading: synthetic takes with known flaws (latency, swing,
// misses, extra taps) must produce the expected scores and verdicts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GROOVE } from "../src/patterns.js";
import { buildTimeline } from "../src/timeline.js";
import { creditForError, matchTaps, median, scoreTake, swingVerdict } from "../src/scoring.js";

function take({ bpm = 120, reps = 2 } = {}) {
  const pattern = GROOVE;
  const opts = { pattern, bpm, reps, countInBeats: 4, start: 1 };
  const straight = buildTimeline({ ...opts, feel: "straight" });
  const swung = buildTimeline({ ...opts, feel: "swung" });
  return { straight: straight.notes, swung: swung.notes, spb: straight.spb };
}

const timesOf = (notes) => notes.map((n) => n.time);

test("credit is full near the beat, zero far from it, linear between", () => {
  assert.equal(creditForError(0), 1);
  assert.equal(creditForError(-20), 1);
  assert.equal(creditForError(60), 0.5);
  assert.equal(creditForError(150), 0);
});

test("median handles odd, even and empty lists", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), 0);
});

test("a duplicate tap on one note becomes an extra, keeping the closer tap", () => {
  const { claimed, extras } = matchTaps([1, 2], [1.05, 0.99]);
  assert.deepEqual(claimed, [0.99, null]);
  assert.deepEqual(extras, [1.05]);
});

test("perfect taps score 100 and read as straight", () => {
  const t = take();
  const result = scoreTake({ ...t, taps: timesOf(t.straight) });
  assert.equal(result.score, 100);
  assert.equal(result.misses, 0);
  assert.equal(result.extras, 0);
  assert.equal(result.swingIndex, 0);
  assert.equal(result.verdict, "straight");
});

test("tapping the swung version reads as fully swung and loses points", () => {
  const t = take();
  const result = scoreTake({ ...t, taps: timesOf(t.swung) });
  assert.ok(Math.abs(result.swingIndex - 1) < 1e-9);
  assert.equal(result.verdict, "swung");
  assert.ok(result.score < 90, `score was ${result.score}`);
});

test("a constant device delay is detected and forgiven", () => {
  const t = take();
  const result = scoreTake({ ...t, taps: timesOf(t.straight).map((x) => x + 0.09) });
  assert.ok(Math.abs(result.offsetMs - 90) < 1e-6);
  assert.equal(result.score, 100);
  assert.ok(Math.abs(result.swingIndex) < 1e-9);
});

test("latency plus swing still reports the swing", () => {
  const t = take();
  const result = scoreTake({ ...t, taps: timesOf(t.swung).map((x) => x + 0.06) });
  assert.ok(Math.abs(result.swingIndex - 1) < 1e-9);
  assert.ok(Math.abs(result.offsetMs - 60) < 1e-6);
});

test("half-way sixteenths read as in between", () => {
  const t = take({ reps: 1 });
  const taps = t.straight.map((n, i) => (n.frac === 0 ? n.time : (n.time + t.swung[i].time) / 2));
  const result = scoreTake({ ...t, taps });
  assert.ok(Math.abs(result.swingIndex - 0.5) < 1e-9);
  assert.equal(result.verdict, "between");
});

test("missed notes and extra taps both cost points", () => {
  const t = take({ reps: 1 });
  const all = timesOf(t.straight);
  const missing = scoreTake({ ...t, taps: all.slice(0, 9) });
  assert.equal(missing.misses, 1);
  assert.equal(missing.score, 90);

  const restTap = t.straight[3].time + 0.6 * t.spb; // inside m. 47's beat-4 rest
  const extra = scoreTake({ ...t, taps: [...all, restTap] });
  assert.equal(extra.extras, 1);
  assert.equal(extra.score, Math.round((100 * 10) / 10.5));
});

test("count-in taps are ignored rather than counted as extras", () => {
  const t = take({ reps: 1 });
  const countInTaps = [1, 1.5, 2, 2.5];
  const result = scoreTake({ ...t, taps: [...countInTaps, ...timesOf(t.straight)] });
  assert.equal(result.extras, 0);
  assert.equal(result.score, 100);
});

test("no taps at all scores zero with no swing reading", () => {
  const t = take();
  const result = scoreTake({ ...t, taps: [] });
  assert.equal(result.score, 0);
  assert.equal(result.swingIndex, null);
  assert.equal(result.verdict, "none");
});

test("verdict thresholds split the 0–1 range in thirds", () => {
  assert.equal(swingVerdict(0.2), "straight");
  assert.equal(swingVerdict(0.5), "between");
  assert.equal(swingVerdict(0.9), "swung");
});
