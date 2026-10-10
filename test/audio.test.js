// The only pure piece of audio.js; the rest needs a real AudioContext
// and is exercised end-to-end by tools/shot-app.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { midiToHz } from "../src/audio.js";

test("MIDI note numbers map to equal-tempered frequencies", () => {
  assert.equal(midiToHz(69), 440);
  assert.ok(Math.abs(midiToHz(60) - 261.6256) < 1e-3);
  assert.ok(Math.abs(midiToHz(52) - 164.8138) < 1e-3);
});
