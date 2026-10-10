/*
 * main.js — wires the page together: global settings, the Compare strip,
 * and the two drills ("Which one?" and "Tap it").
 *
 * Everything that makes sound goes through one transport, so only one
 * thing plays at a time and every section gets the same playhead and
 * note-highlighting for free. A transport pulls "takes" (a feel, a
 * number of reps, an optional count-off) one at a time and schedules
 * each just ahead of the audio clock, which is what lets Compare loop
 * forever and pick up tempo changes on the next pass.
 *
 * The pure logic lives elsewhere (patterns, timeline, scoring, quiz,
 * notation) and is unit-tested; this file is DOM and glue only.
 */

import { PATTERNS, getPattern, otherFeel, patternLengthBeats } from "./patterns.js";
import { buildTimeline, secondsPerBeat } from "./timeline.js";
import { renderRhythm } from "./notation.js";
import { scoreTake } from "./scoring.js";
import { createQuiz, emptyStats } from "./quiz.js";
import { AudioEngine } from "./audio.js";

const $ = (id) => document.getElementById(id);
const engine = new AudioEngine();

const COUNT_IN_BEATS = 4;
const SCHEDULE_AHEAD_S = 0.6;
const TAP_BARS = 4;
const SUBDIVISIONS = { none: [], sixteenths: [1 / 4, 1 / 2, 3 / 4], triplets: [1 / 3, 2 / 3] };
const FEEL_NAME = { straight: "as written", swung: "swung" };

// Per-viewer conveniences only; the app works fine without storage.
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`sodapop:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`sodapop:${key}`, JSON.stringify(value));
    } catch {
      /* private mode or blocked storage */
    }
  },
};

const state = {
  patternId: PATTERNS.some((p) => p.id === store.get("pattern")) ? store.get("pattern") : "call",
  bpm: Number(store.get("bpm", 120)) || 120,
  click: store.get("click", true) !== false,
};

const currentPattern = () => getPattern(state.patternId);
const clickMode = () => (state.click ? "all" : "countIn");

// ---------------------------------------------------------------------------
// Staves

const staffs = {};

function mountStaff(key, host, feel, opts = {}) {
  const pattern = currentPattern();
  const rendered = renderRhythm(pattern.bars, feel, opts);
  host.innerHTML = rendered.svg;
  const svg = host.querySelector("svg");
  staffs[key] = { svg, beatX: rendered.beatX, playhead: svg.querySelector(".playhead") };
}

function renderStaffs() {
  mountStaff("straight", $("staff-straight"), "straight", { grid: true });
  mountStaff("swung", $("staff-swung"), "swung", { grid: true });
  mountStaff("answerStraight", $("answer-staff-straight"), "straight", { label: "As written" });
  mountStaff("answerSwung", $("answer-staff-swung"), "swung", { label: "Swung" });
  mountStaff("tap", $("staff-tap"), "straight");
}

function setPlayhead(staff, beat) {
  if (beat === null) {
    staff.playhead.setAttribute("visibility", "hidden");
    return;
  }
  const x = staff.beatX(beat);
  staff.playhead.setAttribute("x1", x);
  staff.playhead.setAttribute("x2", x);
  staff.playhead.setAttribute("visibility", "visible");
}

function clearStaffAnimation() {
  for (const staff of Object.values(staffs)) {
    staff.svg.classList.remove("is-playing");
    staff.svg.querySelectorAll(".lit").forEach((el) => el.classList.remove("lit"));
    setPlayhead(staff, null);
  }
}

// ---------------------------------------------------------------------------
// Transport: one playback at a time

let transport = null;

/**
 * @param {object} opts
 * @param {(i: number) => object|null} opts.nextTake  take spec for pass i, or null when done.
 *   A spec is { feel, reps, countIn, clicks, notes, subdivisions, staff, onFrame }.
 * @param {(reason: "end"|"user") => void} [opts.onStop]
 */
async function startTransport({ nextTake, onStop }) {
  stopTransport("user");
  const t = { takes: [], onStop, bus: null, timer: 0, raf: 0, finished: false };
  transport = t;
  updateTransportUi();
  await engine.ensure();
  if (transport !== t) return null;

  t.bus = engine.createBus();
  let cursor = engine.currentTime + 0.12;

  const pump = () => {
    while (!t.finished && cursor < engine.currentTime + SCHEDULE_AHEAD_S) {
      const spec = nextTake(t.takes.length);
      if (!spec) {
        t.finished = true;
        break;
      }
      const timeline = buildTimeline({
        pattern: currentPattern(),
        feel: spec.feel,
        bpm: state.bpm,
        reps: spec.reps ?? 1,
        countInBeats: spec.countIn ?? 0,
        start: cursor,
      });
      engine.schedule(t.bus, timeline, {
        clicks: spec.clicks ?? clickMode(),
        notes: spec.notes ?? true,
        subdivisions: spec.subdivisions ?? [],
      });
      t.takes.push({ spec, timeline });
      cursor = timeline.end;
    }
    if (t.finished && engine.heardTime() > cursor + 0.15) stopTransport("end");
  };

  const frame = () => {
    animate(t);
    t.raf = requestAnimationFrame(frame);
  };

  pump();
  t.timer = setInterval(pump, 50);
  t.raf = requestAnimationFrame(frame);
  return t;
}

function stopTransport(reason) {
  const t = transport;
  if (!t) return;
  transport = null;
  t.bus?.stop();
  clearInterval(t.timer);
  cancelAnimationFrame(t.raf);
  clearStaffAnimation();
  updateTransportUi();
  t.onStop?.(reason, t);
}

function animate(t) {
  const heard = engine.heardTime();
  const take = t.takes.find(({ timeline }) => heard >= timeline.start && heard < timeline.end);
  for (const staff of Object.values(staffs)) {
    if (!take || take.spec.staff !== staff) {
      staff.svg.classList.remove("is-playing");
      setPlayhead(staff, null);
    }
  }
  if (!take) return;
  const { spec, timeline } = take;
  spec.onFrame?.(heard, timeline);
  const staff = spec.staff;
  if (!staff) return;

  staff.svg.classList.add("is-playing");
  const beats = (heard - timeline.patternStart) / timeline.spb;
  setPlayhead(staff, beats < 0 ? null : beats % patternLengthBeats(currentPattern()));

  const lit = new Set(
    timeline.notes.filter((n) => heard >= n.time && heard < n.time + Math.max(n.duration, 0.12)).map((n) => String(n.index)),
  );
  staff.svg.querySelectorAll(".note").forEach((el) => el.classList.toggle("lit", lit.has(el.dataset.i)));
}

// ---------------------------------------------------------------------------
// Global controls

function renderPatternPicker() {
  const picker = $("pattern-picker");
  picker.innerHTML = "";
  for (const p of PATTERNS) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(p.id === state.patternId));
    b.title = p.name;
    b.textContent = p.label;
    b.addEventListener("click", () => selectPattern(p.id));
    picker.append(b);
  }
}

function selectPattern(id) {
  if (id === state.patternId) return;
  stopTransport("user");
  state.patternId = id;
  store.set("pattern", id);
  renderPatternPicker();
  renderStaffs();
  renderGapReadout();
  resetQuizQuestion();
  resetTap();
}

function setTempo(bpm) {
  const input = $("tempo");
  const clamped = Math.min(Number(input.max), Math.max(Number(input.min), bpm));
  state.bpm = clamped;
  input.value = clamped;
  $("tempo-value").textContent = `♩ = ${clamped}`;
  store.set("bpm", clamped);
  renderGapReadout();
}

function renderGapReadout() {
  const spb = secondsPerBeat(state.bpm);
  const sixteenth = Math.round((3 / 4 - 2 / 3) * spb * 1000);
  const eighth = Math.round((2 / 3 - 1 / 2) * spb * 1000);
  let text = `At ♩ = ${state.bpm}, swinging moves the sixteenth <strong>${sixteenth} ms</strong> early.`;
  if (state.patternId !== "call") {
    text += ` In m. 48 it also drags the eighths on the "and" of 2 and 4 <strong>${eighth} ms</strong> late.`;
  }
  $("gap-readout").innerHTML = text;
}

function updateTransportUi() {
  const playing = transport !== null;
  $("stop-all").disabled = !playing;
  const mode = playing ? transport.mode : null;
  document.querySelectorAll("[data-play]").forEach((b) => b.setAttribute("aria-pressed", String(mode === b.dataset.play)));
  $("ab-loop").setAttribute("aria-pressed", String(mode === "ab"));
}

// ---------------------------------------------------------------------------
// Compare: loop either version, or alternate A/B

async function playCompare(mode) {
  if (transport?.mode === mode) {
    stopTransport("user");
    return;
  }
  const feelFor = (i) => (mode === "ab" ? (i % 2 === 0 ? "straight" : "swung") : mode);
  const t = startTransport({
    nextTake: (i) => {
      const feel = feelFor(i);
      return {
        feel,
        countIn: i === 0 ? COUNT_IN_BEATS : 0,
        subdivisions: SUBDIVISIONS[$("subdivision").value],
        staff: staffs[feel],
      };
    },
  });
  if (transport) transport.mode = mode;
  updateTransportUi();
  await t;
}

// ---------------------------------------------------------------------------
// Quiz: "Which one did you hear?"

function loadQuizStats() {
  const saved = store.get("quizStats", null);
  const fresh = emptyStats();
  if (!saved || typeof saved.total !== "number" || !saved.byFeel?.straight || !saved.byFeel?.swung) return fresh;
  return { ...fresh, ...saved };
}

let quiz = createQuiz({ stats: loadQuizStats() });
let quizPhase = "idle"; // idle → asking → answered
let quizFeel = null;

function playQuizQuestion() {
  startTransport({
    nextTake: (i) => (i === 0 ? { feel: quizFeel, reps: 2, countIn: COUNT_IN_BEATS } : null),
  });
}

function onQuizPlay() {
  if (quizPhase !== "asking") {
    quizFeel = quiz.next();
    quizPhase = "asking";
    renderQuiz();
  }
  playQuizQuestion();
}

function onQuizAnswer(guess) {
  if (quizPhase !== "asking") return;
  const { correct, actual } = quiz.answer(guess);
  quizPhase = "answered";
  store.set("quizStats", quiz.stats);

  document.querySelectorAll("[data-answer]").forEach((b) => {
    b.classList.toggle("is-correct", b.dataset.answer === actual);
    b.classList.toggle("is-wrong", b.dataset.answer === guess && !correct);
  });
  const hint =
    actual === "swung"
      ? "The short note came early, on the last note of a triplet."
      : "The short note waited for the last sixteenth, tight against the next beat.";
  $("quiz-feedback").innerHTML = correct
    ? `<span class="good">Correct. That was ${FEEL_NAME[actual]}.</span><small>${hint}</small>`
    : `<span class="bad">Not quite. That was ${FEEL_NAME[actual]}.</span><small>${hint}</small>`;
  renderQuiz();
}

function onQuizCompare() {
  const order = [quizFeel, otherFeel(quizFeel)];
  const staffFor = { straight: staffs.answerStraight, swung: staffs.answerSwung };
  startTransport({
    nextTake: (i) => (i < 2 ? { feel: order[i], countIn: COUNT_IN_BEATS, staff: staffFor[order[i]] } : null),
  });
}

function resetQuizQuestion() {
  quizPhase = "idle";
  quizFeel = null;
  $("quiz-feedback").textContent = "";
  document.querySelectorAll("[data-answer]").forEach((b) => b.classList.remove("is-correct", "is-wrong"));
  renderQuiz();
}

function renderQuiz() {
  const asking = quizPhase === "asking";
  $("quiz-play").textContent = asking ? "Play it again" : quizPhase === "answered" ? "Next rhythm" : "Play a rhythm";
  $("quiz-play").hidden = quizPhase === "answered";
  $("quiz-after").hidden = quizPhase !== "answered";
  $("quiz-answers").classList.toggle("is-waiting", quizPhase === "idle");
  document.querySelectorAll("[data-answer]").forEach((b) => (b.disabled = !asking));
  if (quizPhase !== "answered") {
    document.querySelectorAll("[data-answer]").forEach((b) => b.classList.remove("is-correct", "is-wrong"));
  }

  const s = quiz.stats;
  const pct = (c, n) => (n ? `${Math.round((100 * c) / n)}%` : "–");
  $("quiz-stats").innerHTML = `
    <div><dt>Correct</dt><dd>${s.correct}<small> / ${s.total}</small></dd></div>
    <div><dt>Accuracy</dt><dd>${pct(s.correct, s.total)}</dd></div>
    <div><dt>Streak</dt><dd>${s.streak}<small> best ${s.bestStreak}</small></dd></div>
    <div><dt>Spotting “as written”</dt><dd>${pct(s.byFeel.straight.correct, s.byFeel.straight.asked)}</dd></div>
    <div><dt>Spotting “swung”</dt><dd>${pct(s.byFeel.swung.correct, s.byFeel.swung.asked)}</dd></div>`;
}

// ---------------------------------------------------------------------------
// Tap it

let tapPhase = "idle"; // idle → running → done
let taps = [];

function tapReps() {
  return TAP_BARS / currentPattern().bars.length;
}

function setPad(main, sub, cls = "") {
  const pad = $("tap-pad");
  $("tap-pad-label").textContent = main;
  $("tap-pad-sub").textContent = sub;
  pad.classList.remove("is-armed", "is-live");
  if (cls) pad.classList.add(cls);
}

function startTap() {
  stopTransport("user");
  taps = [];
  tapPhase = "running";
  clearTapMarks();
  $("tap-results").hidden = true;
  const reps = tapReps();
  setPad("Get ready", "Listen to the count-off", "is-armed");

  startTransport({
    nextTake: (i) =>
      i === 0
        ? {
            feel: "straight",
            reps,
            countIn: COUNT_IN_BEATS,
            clicks: "all",
            notes: $("guide-toggle").checked,
            staff: staffs.tap,
            onFrame: (heard, timeline) => {
              const beats = (heard - timeline.patternStart) / timeline.spb;
              if (beats < 0) {
                setPad(String(Math.min(COUNT_IN_BEATS, Math.floor(beats + COUNT_IN_BEATS) + 1)), "Count-off", "is-armed");
              } else {
                const bar = Math.min(TAP_BARS, Math.floor(beats / 4) + 1);
                setPad("Tap", `Bar ${bar} of ${TAP_BARS}`, "is-live");
              }
            },
          }
        : null,
    onStop: (reason, t) => finishTap(reason, t),
  });
}

function registerTap(timeStamp) {
  if (tapPhase !== "running" || !engine.ready) return;
  taps.push(engine.tapTime(timeStamp));
  const pad = $("tap-pad");
  pad.classList.add("is-hit");
  setTimeout(() => pad.classList.remove("is-hit"), 70);
}

function finishTap(reason, t) {
  if (reason !== "end" || !t.takes.length) {
    resetTap();
    return;
  }
  tapPhase = "done";
  const { timeline } = t.takes[0];
  const swung = buildTimeline({
    pattern: currentPattern(),
    feel: "swung",
    bpm: timeline.bpm,
    reps: tapReps(),
    countInBeats: COUNT_IN_BEATS,
    start: timeline.start,
  });
  const result = scoreTake({ straight: timeline.notes, swung: swung.notes, taps, spb: timeline.spb });
  renderTapResult(result, timeline);
  setPad("Go again", `${TAP_BARS} bars · count-off first`);
}

function resetTap() {
  tapPhase = "idle";
  taps = [];
  setPad("Start", `${TAP_BARS} bars · count-off first`);
}

function clearTapMarks() {
  staffs.tap?.svg.querySelector(".tap-marks")?.remove();
}

function drawTapMarks(result, timeline) {
  clearTapMarks();
  const staff = staffs.tap;
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "tap-marks");
  const patternBeats = patternLengthBeats(currentPattern());
  result.notes.forEach((n, i) => {
    if (n.tap === null) return;
    // n.tap is already latency-corrected by scoreTake.
    const beat = (n.tap - timeline.patternStart) / timeline.spb;
    const rep = timeline.notes[i].rep;
    const x = staff.beatX(((beat % patternBeats) + patternBeats) % patternBeats);
    const abs = Math.abs(n.errorMs);
    const mark = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    mark.setAttribute("cx", x.toFixed(1));
    mark.setAttribute("cy", String(88 + rep * 6));
    mark.setAttribute("r", "2.6");
    mark.setAttribute("class", `tap-mark tap-mark--${abs <= 20 ? "good" : abs <= 50 ? "ok" : "off"}`);
    group.append(mark);
  });
  staff.svg.append(group);
}

const VERDICT_TEXT = {
  straight: "Played as written",
  between: "Halfway to swung",
  swung: "Swinging it",
  none: "No off-beat notes caught",
};

function renderTapResult(result, timeline) {
  $("tap-results").hidden = false;
  $("result-score").textContent = String(result.score);
  const verdict = $("result-verdict");
  verdict.textContent = VERDICT_TEXT[result.verdict];
  verdict.className = `verdict verdict--${result.verdict}`;

  const track = $("meter-track");
  track.querySelectorAll(".meter-dot, .meter-mean").forEach((el) => el.remove());
  const toLeft = (s) => `${((Math.min(1.5, Math.max(-0.5, s)) + 0.5) / 2) * 100}%`;
  for (const n of result.notes) {
    if (n.swing === null) continue;
    const dot = document.createElement("span");
    dot.className = "meter-dot";
    dot.style.left = toLeft(n.swing);
    track.append(dot);
  }
  if (result.swingIndex !== null) {
    const mean = document.createElement("span");
    mean.className = "meter-mean";
    mean.style.left = toLeft(result.swingIndex);
    track.append(mean);
    $("meter-caption").textContent = `Each dot is one off-beat note; the bar is your average (${Math.round(result.swingIndex * 100)}% of the way to a triplet).`;
  } else {
    $("meter-caption").textContent = "Tap the short notes too, and this shows how far they drift toward a triplet.";
  }

  const facts = [];
  if (result.meanAbsErrorMs !== null) {
    facts.push(`Average timing error: <span class="mono">${Math.round(result.meanAbsErrorMs)} ms</span>.`);
  }
  if (Math.abs(result.offsetMs) >= 15) {
    const dir = result.offsetMs > 0 ? "behind" : "ahead of";
    facts.push(
      `Your on-beat taps ran <span class="mono">${Math.round(Math.abs(result.offsetMs))} ms</span> ${dir} the click. Some of that is usually device lag (Bluetooth speakers add a lot), so the score allows for it.`,
    );
  }
  if (result.misses || result.extras) {
    const parts = [];
    if (result.misses) parts.push(`${result.misses} missed note${result.misses === 1 ? "" : "s"}`);
    if (result.extras) parts.push(`${result.extras} extra tap${result.extras === 1 ? "" : "s"}`);
    facts.push(`${parts.join(" and ")}.`);
  }
  const advice = {
    straight: "Keep it there. The sixteenth should feel tight against the next beat.",
    between: 'Count "1 e & a" in your head and put the short note on the "a", later than feels natural.',
    swung: 'Count "1 e & a" and put the short note on the "a". Try the Compare loop with sixteenth ticks, then come back.',
    none: "",
  }[result.verdict];
  if (advice) facts.push(advice);
  $("result-facts").innerHTML = facts.map((f) => `<li>${f}</li>`).join("");

  drawTapMarks(result, timeline);
}

// ---------------------------------------------------------------------------
// Tabs

function selectTab(name) {
  const tabs = { quiz: $("tab-quiz"), tap: $("tab-tap") };
  if (!tabs[name]) return;
  for (const [key, tab] of Object.entries(tabs)) {
    const on = key === name;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`panel-${key}`).hidden = !on;
  }
  if (tapPhase === "running") stopTransport("user");
  history.replaceState(null, "", `#${name}`);
}

// ---------------------------------------------------------------------------
// Wire up

function init() {
  renderPatternPicker();
  renderStaffs();
  setTempo(state.bpm);
  $("click-toggle").checked = state.click;
  renderQuiz();
  resetTap();

  $("tempo").addEventListener("input", (e) => setTempo(Number(e.target.value)));
  $("tempo-down").addEventListener("click", () => setTempo(state.bpm - 2));
  $("tempo-up").addEventListener("click", () => setTempo(state.bpm + 2));
  $("click-toggle").addEventListener("change", (e) => {
    state.click = e.target.checked;
    store.set("click", state.click);
  });

  document.querySelectorAll("[data-play]").forEach((b) => b.addEventListener("click", () => playCompare(b.dataset.play)));
  $("ab-loop").addEventListener("click", () => playCompare("ab"));
  $("stop-all").addEventListener("click", () => stopTransport("user"));

  $("quiz-play").addEventListener("click", onQuizPlay);
  $("quiz-next").addEventListener("click", onQuizPlay);
  $("quiz-compare").addEventListener("click", onQuizCompare);
  document.querySelectorAll("[data-answer]").forEach((b) => b.addEventListener("click", () => onQuizAnswer(b.dataset.answer)));
  $("quiz-reset").addEventListener("click", () => {
    quiz = createQuiz({ stats: emptyStats() });
    store.set("quizStats", quiz.stats);
    resetQuizQuestion();
  });

  // pointerdown, not click: click fires on release, which is late and
  // varies with how long you hold your finger down.
  $("tap-pad").addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (tapPhase === "running") registerTap(e.timeStamp);
    else startTap();
  });
  document.addEventListener("keydown", (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (tapPhase === "running") {
      e.preventDefault();
      registerTap(e.timeStamp);
    } else if (e.target === $("tap-pad") && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      startTap();
    }
  });

  $("tab-quiz").addEventListener("click", () => selectTab("quiz"));
  $("tab-tap").addEventListener("click", () => selectTab("tap"));
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = $("tab-quiz").getAttribute("aria-selected") === "true" ? "tap" : "quiz";
    selectTab(next);
    $(`tab-${next}`).focus();
  });
  const fromHash = location.hash.replace("#", "");
  if (fromHash === "tap" || fromHash === "quiz") selectTab(fromHash);
}

init();
