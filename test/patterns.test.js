// Guards the transcription of mm. 47–48: every bar adds up to 4/4, and
// the straight and swung versions differ only where they should.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DURATION_BEATS,
  FEELS,
  PATTERNS,
  getPattern,
  otherFeel,
  patternLengthBeats,
  soundingNotes,
} from "../src/patterns.js";

const close = (a, b) => Math.abs(a - b) < 1e-9;

test("every beat of every bar fills exactly one quarter note", () => {
  for (const pattern of PATTERNS) {
    for (const bar of pattern.bars) {
      for (const feel of FEELS) {
        assert.equal(bar[feel].length, 4, `${pattern.id} ${feel} has 4 beats`);
        for (const beat of bar[feel]) {
          const total = beat.reduce((sum, t) => sum + DURATION_BEATS[t.d], 0);
          assert.ok(close(total, 1), `${pattern.id} ${feel} beat sums to ${total}`);
        }
      }
    }
  }
});

test("each bar has one pitch per sounding note", () => {
  for (const pattern of PATTERNS) {
    for (const bar of pattern.bars) {
      for (const feel of FEELS) {
        const sounding = bar[feel].flat().filter((t) => !t.rest).length;
        assert.equal(sounding, bar.pitches.length, `${pattern.id} ${feel}`);
      }
    }
  }
});

test("m. 47 straight onsets match the score", () => {
  const beats = soundingNotes(getPattern("call"), "straight").map((n) => n.beat);
  assert.deepEqual(beats, [0, 1, 2, 2.75]);
});

test("m. 47 swung puts the short note on the last triplet partial", () => {
  const beats = soundingNotes(getPattern("call"), "swung").map((n) => n.beat);
  assert.deepEqual(beats.slice(0, 3), [0, 1, 2]);
  assert.ok(close(beats[3], 2 + 2 / 3));
});

test("m. 48 straight onsets match the score", () => {
  const beats = soundingNotes(getPattern("answer"), "straight").map((n) => n.beat);
  assert.deepEqual(beats, [0, 0.75, 1.5, 2, 2.75, 3.5]);
});

test("m. 48 swung moves sixteenths earlier and off-beat eighths later", () => {
  const straight = soundingNotes(getPattern("answer"), "straight");
  const swung = soundingNotes(getPattern("answer"), "swung");
  assert.ok(close(swung[1].frac, 2 / 3) && swung[1].frac < straight[1].frac);
  assert.ok(close(swung[2].frac, 2 / 3) && swung[2].frac > straight[2].frac);
});

test("both feels keep the same notes, pitches and on-beat positions", () => {
  for (const pattern of PATTERNS) {
    const straight = soundingNotes(pattern, "straight");
    const swung = soundingNotes(pattern, "swung");
    assert.equal(straight.length, swung.length);
    straight.forEach((note, i) => {
      assert.equal(note.pitch, swung[i].pitch);
      assert.equal(note.beatIndex, swung[i].beatIndex);
      if (note.frac === 0) assert.equal(swung[i].frac, 0);
    });
  }
});

test("the full groove is the call followed by the answer", () => {
  const groove = getPattern("groove");
  assert.equal(patternLengthBeats(groove), 8);
  const beats = soundingNotes(groove, "straight").map((n) => n.beat);
  assert.deepEqual(beats, [0, 1, 2, 2.75, 4, 4.75, 5.5, 6, 6.75, 7.5]);
});

test("lookups reject unknown ids and feels", () => {
  assert.throws(() => getPattern("nope"));
  assert.throws(() => soundingNotes(getPattern("call"), "shuffle"));
  assert.equal(otherFeel("straight"), "swung");
  assert.equal(otherFeel("swung"), "straight");
});
