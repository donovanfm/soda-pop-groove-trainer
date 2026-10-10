// Guards the transcription of mm. 47–48: every bar adds up to 4/4, and
// the straight and swung versions differ only where they should.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DURATION_BEATS, FEELS, GROOVE, otherFeel, patternLengthBeats, soundingNotes } from "../src/patterns.js";

const close = (a, b) => Math.abs(a - b) < 1e-9;
const bar = (notes, index) => notes.filter((n) => Math.floor(n.beat / 4) === index);

test("every beat of every bar fills exactly one quarter note", () => {
  for (const b of GROOVE.bars) {
    for (const feel of FEELS) {
      assert.equal(b[feel].length, 4, `${feel} has 4 beats`);
      for (const beat of b[feel]) {
        const total = beat.reduce((sum, t) => sum + DURATION_BEATS[t.d], 0);
        assert.ok(close(total, 1), `${feel} beat sums to ${total}`);
      }
    }
  }
});

test("each bar has one pitch per sounding note", () => {
  for (const b of GROOVE.bars) {
    for (const feel of FEELS) {
      const sounding = b[feel].flat().filter((t) => !t.rest).length;
      assert.equal(sounding, b.pitches.length, feel);
    }
  }
});

test("the groove is two bars of 4/4", () => {
  assert.equal(GROOVE.bars.length, 2);
  assert.equal(patternLengthBeats(GROOVE), 8);
});

test("straight onsets match the score", () => {
  const beats = soundingNotes(GROOVE, "straight").map((n) => n.beat);
  assert.deepEqual(beats, [0, 1, 2, 2.75, 4, 4.75, 5.5, 6, 6.75, 7.5]);
});

test("m. 47 swung puts the short note on the last triplet partial", () => {
  const beats = bar(soundingNotes(GROOVE, "swung"), 0).map((n) => n.beat);
  assert.deepEqual(beats.slice(0, 3), [0, 1, 2]);
  assert.ok(close(beats[3], 2 + 2 / 3));
});

test("m. 48 swung moves sixteenths earlier and off-beat eighths later", () => {
  const straight = bar(soundingNotes(GROOVE, "straight"), 1);
  const swung = bar(soundingNotes(GROOVE, "swung"), 1);
  assert.ok(close(swung[1].frac, 2 / 3) && swung[1].frac < straight[1].frac);
  assert.ok(close(swung[2].frac, 2 / 3) && swung[2].frac > straight[2].frac);
});

test("both feels keep the same notes, pitches and on-beat positions", () => {
  const straight = soundingNotes(GROOVE, "straight");
  const swung = soundingNotes(GROOVE, "swung");
  assert.equal(straight.length, swung.length);
  straight.forEach((note, i) => {
    assert.equal(note.pitch, swung[i].pitch);
    assert.equal(note.beatIndex, swung[i].beatIndex);
    if (note.frac === 0) assert.equal(swung[i].frac, 0);
  });
});

test("rejects unknown feels; otherFeel flips", () => {
  assert.throws(() => soundingNotes(GROOVE, "shuffle"));
  assert.equal(otherFeel("straight"), "swung");
  assert.equal(otherFeel("swung"), "straight");
});
