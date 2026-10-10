// Engraver smoke tests: right number of notes, triplet brackets only on
// the swung version, and proportional beat→x spacing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GROOVE, soundingNotes } from "../src/patterns.js";
import { renderRhythm, rhythmLayout } from "../src/notation.js";

const count = (svg, needle) => svg.split(needle).length - 1;
const [CALL, ANSWER] = GROOVE.bars;

test("draws one note group per sounding note, indexed in order", () => {
  for (const feel of ["straight", "swung"]) {
    const { svg } = renderRhythm(GROOVE.bars, feel);
    const expected = soundingNotes(GROOVE, feel).length;
    assert.equal(count(svg, `class="note"`), expected, feel);
    assert.ok(svg.includes(`data-i="${expected - 1}"`));
  }
});

test("only the swung version gets triplet brackets", () => {
  assert.equal(count(renderRhythm(GROOVE.bars, "straight").svg, `class="tuplet"`), 0);
  assert.equal(count(renderRhythm(GROOVE.bars, "swung").svg, `class="tuplet"`), 5);
  assert.equal(count(renderRhythm([ANSWER], "swung").svg, `class="tuplet"`), 4);
});

test("dotted eighths get a dot, and sixteenths a partial beam", () => {
  const { svg } = renderRhythm([CALL], "straight");
  assert.equal(count(svg, `r="2"/>`), 1);
  // Beat 3 beams the dotted eighth to the sixteenth: primary + partial beam.
  assert.equal(count(svg, "<rect"), 2);
});

test("aria label spells the rhythm out", () => {
  const { svg } = renderRhythm([CALL], "straight");
  assert.match(svg, /aria-label="As written: eighth, eighth rest, eighth, eighth rest, dotted eighth, sixteenth, quarter rest"/);
});

test("beat→x is linear inside a bar and skips the bar padding between bars", () => {
  const { beatX } = rhythmLayout(2);
  const beatWidth = beatX(1) - beatX(0);
  assert.equal(beatX(2.75) - beatX(2), 0.75 * beatWidth);
  assert.ok(beatX(4) - beatX(3) > beatWidth);
});

test("grid ticks follow sixteenths when straight and triplets when swung", () => {
  assert.equal(count(renderRhythm(GROOVE.bars, "straight", { grid: true }).svg, `class="tick`), 32);
  assert.equal(count(renderRhythm(GROOVE.bars, "swung", { grid: true }).svg, `class="tick`), 24);
});
