/*
 * notation.js — a tiny rhythm engraver that turns pattern bars into SVG.
 *
 * It only knows the handful of shapes in patterns.js (quarters, eighths,
 * dotted eighths, sixteenths, triplet quarter+eighth, and their rests),
 * drawn on a one-line percussion staff with stems up. Horizontal
 * spacing is strictly proportional to time, unlike real engraving, on
 * purpose: the gap between a dotted-eighth/sixteenth and a triplet is
 * visible on screen, and the playhead can move linearly.
 *
 * Returns a string (so it's testable in Node) plus a beat→x mapping that
 * main.js uses to drive the playhead and tap markers. Notes carry
 * `data-i` (index into soundingNotes order) for highlighting.
 */

import { DURATION_BEATS } from "./patterns.js";

const BEAT_W = 64;
const LEFT = 10;
const BAR_INSET = 16;
const BAR_W = BEAT_W * 4 + BAR_INSET * 2;
const STAFF_Y = 64;
const STEM_LEN = 32;
const STEM_DX = 5.6;
const BEAM_T = 4.2;
const HEIGHT = 112;
const GRID_Y = 100;

const BEAMABLE = new Set(["8", "8.", "16"]);
const FLAGS = { "8": 1, "8.": 1, "16": 2, "8t": 1 };
const SPOKEN = {
  "4": "quarter", "8": "eighth", "8.": "dotted eighth", "16": "sixteenth",
  "4t": "triplet quarter", "8t": "triplet eighth",
};

const f = (v) => Math.round(v * 10) / 10;

export function rhythmLayout(barCount) {
  const width = LEFT * 2 + barCount * BAR_W;
  const beatX = (beat) => {
    const bar = Math.min(Math.floor(beat / 4), barCount - 1);
    return LEFT + bar * BAR_W + BAR_INSET + (beat - bar * 4) * BEAT_W;
  };
  return { width, height: HEIGHT, beatX };
}

function notehead(x, y) {
  return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="6.4" ry="4.5" transform="rotate(-22 ${f(x)} ${f(y)})"/>`;
}

function stem(x, y) {
  return `<line x1="${f(x + STEM_DX)}" y1="${f(y - 1)}" x2="${f(x + STEM_DX)}" y2="${f(y - STEM_LEN)}" class="stem"/>`;
}

function flag(x, y, index) {
  const sx = x + STEM_DX;
  const top = y - STEM_LEN + index * 7;
  return `<path class="fill" d="M${f(sx)} ${f(top)} c 1 6 9 8 7 17 c -1 -6 -4 -9 -7 -10 z"/>`;
}

function beam(x1, x2, y) {
  return `<rect class="fill beam" x="${f(x1)}" y="${f(y)}" width="${f(x2 - x1)}" height="${BEAM_T}"/>`;
}

function dot(x, y) {
  return `<circle class="fill" cx="${f(x + 11)}" cy="${f(y - 4)}" r="2"/>`;
}

function articulations(x, y, token) {
  let out = "";
  let below = y + 10;
  if (token.staccato) {
    out += `<circle class="fill" cx="${f(x)}" cy="${f(below)}" r="1.7"/>`;
    below += 5;
  }
  if (token.accent) {
    out += `<path class="accent" d="M${f(x - 5)} ${f(below)} L${f(x + 5)} ${f(below + 3)} L${f(x - 5)} ${f(below + 6)}"/>`;
  }
  return out;
}

function rest(x, y, d) {
  if (d === "4" || d === "4t") {
    return `<path class="rest" d="M${f(x + 1)} ${f(y - 15)} L${f(x + 6)} ${f(y - 8)} L${f(x + 1.5)} ${f(y - 2)} L${f(x + 6.5)} ${f(y + 4)} Q${f(x)} ${f(y + 2)} ${f(x + 3.5)} ${f(y + 10)}"/>`;
  }
  return (
    `<circle class="fill" cx="${f(x + 1.5)}" cy="${f(y - 8)}" r="2.4"/>` +
    `<path class="rest" d="M${f(x + 1.5)} ${f(y - 7)} Q${f(x + 5)} ${f(y - 6)} ${f(x + 8)} ${f(y - 10)} L${f(x + 3)} ${f(y + 6)}"/>`
  );
}

function tripletBracket(x1, x2) {
  const y = STAFF_Y - STEM_LEN - 12;
  const mid = (x1 + x2) / 2;
  return (
    `<path class="bracket" d="M${f(x1)} ${f(y + 5)} V${f(y)} H${f(mid - 7)} M${f(mid + 7)} ${f(y)} H${f(x2)} V${f(y + 5)}"/>` +
    `<text class="tuplet" x="${f(mid)}" y="${f(y + 4)}" text-anchor="middle">3</text>`
  );
}

function grid(beatX, barCount, feel) {
  const step = feel === "swung" ? 1 / 3 : 1 / 4;
  const ticks = [];
  for (let beat = 0; beat < barCount * 4 - 1e-9; beat += step) {
    const onBeat = Math.abs(beat - Math.round(beat)) < 1e-6;
    const x = beatX(beat);
    ticks.push(`<line class="${onBeat ? "tick tick--beat" : "tick"}" x1="${f(x)}" y1="${GRID_Y}" x2="${f(x)}" y2="${GRID_Y + (onBeat ? 8 : 4)}"/>`);
  }
  return ticks.join("");
}

/**
 * @param {Array} bars  pattern.bars
 * @param {"straight"|"swung"} feel
 * @param {{grid?: boolean, label?: string}} [opts]
 */
export function renderRhythm(bars, feel, opts = {}) {
  const layout = rhythmLayout(bars.length);
  const { width, beatX } = layout;
  const parts = [];
  const spoken = [];
  let noteIndex = 0;

  parts.push(`<line class="staff-line" x1="${LEFT}" y1="${STAFF_Y}" x2="${width - LEFT}" y2="${STAFF_Y}"/>`);
  for (let i = 0; i <= bars.length; i++) {
    const x = LEFT + i * BAR_W;
    parts.push(`<line class="barline" x1="${x}" y1="${STAFF_Y - 14}" x2="${x}" y2="${STAFF_Y + 14}"/>`);
  }

  bars.forEach((bar, barIndex) => {
    bar[feel].forEach((tokens, beatInBar) => {
      const beatStart = barIndex * 4 + beatInBar;
      let pos = 0;
      const placed = tokens.map((token) => {
        const length = DURATION_BEATS[token.d];
        const x = beatX(beatStart + pos);
        pos += length;
        return { token, x, length };
      });

      const sounding = placed.filter((p) => !p.token.rest);
      const beamGroup = sounding.length >= 2 && sounding.every((p) => BEAMABLE.has(p.token.d));

      for (const { token, x, length } of placed) {
        spoken.push(`${SPOKEN[token.d]}${token.rest ? " rest" : ""}`);
        if (token.rest) {
          // Rests sit in the middle of the silence they stand for; at their
          // onset they'd collide with the short note right before them.
          parts.push(rest(x + (length * BEAT_W) / 2 - 4, STAFF_Y, token.d));
          continue;
        }
        const notes = [notehead(x, STAFF_Y), stem(x, STAFF_Y)];
        if (token.d === "8.") notes.push(dot(x, STAFF_Y));
        if (!beamGroup) {
          for (let k = 0; k < (FLAGS[token.d] ?? 0); k++) notes.push(flag(x, STAFF_Y, k));
        }
        notes.push(articulations(x, STAFF_Y, token));
        parts.push(`<g class="note" data-i="${noteIndex++}">${notes.join("")}</g>`);
      }

      if (beamGroup) {
        const top = STAFF_Y - STEM_LEN;
        const first = sounding[0].x + STEM_DX;
        const last = sounding[sounding.length - 1].x + STEM_DX;
        parts.push(beam(first - 0.7, last + 0.7, top));
        sounding.forEach((p, i) => {
          if (p.token.d !== "16") return;
          const sx = p.x + STEM_DX;
          // A lone sixteenth after a dotted eighth gets a partial beam pointing back.
          const toward = i > 0 ? -10 : 10;
          parts.push(beam(Math.min(sx, sx + toward), Math.max(sx, sx + toward) + 0.7, top + BEAM_T + 2.6));
        });
      }

      if (tokens.some((t) => t.d.endsWith("t"))) {
        const first = placed[0].x - 6;
        const last = placed[placed.length - 1].x + STEM_DX + 4;
        parts.push(tripletBracket(first, last));
      }
    });
  });

  if (opts.grid) parts.push(grid(beatX, bars.length, feel));
  parts.push(`<line class="playhead" x1="0" y1="14" x2="0" y2="${GRID_Y + 8}" visibility="hidden"/>`);

  const label = opts.label ?? `${feel === "swung" ? "Swung" : "As written"}: ${spoken.join(", ")}`;
  const svg =
    `<svg class="rhythm rhythm--${feel}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="${label}">` +
    parts.join("") +
    `</svg>`;
  return { svg, ...layout };
}
