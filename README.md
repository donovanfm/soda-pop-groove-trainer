# Soda Pop Groove Trainer

Practice tool for the low-clarinet groove in **Soda Pop** (Jack Aguirre's
*KPop Demon Hunters Medley* for clarinet choir, mm. 47–62, ♩ = 120):

```
m. 47  ♪ 𝄾 | ♪ 𝄾 | ♪. ♬ | 𝄽      heard as  ♩ ♩ ♪.♬ 𝄽
m. 48  ♪.♬ | 𝄾 ♪ | ♪.♬ | 𝄾 ♪
```

Swinging it moves the sixteenth from ¾ of the beat to ⅔ (a triplet),
42 ms early at tempo. In m. 48 it also drags the off-beat eighths 83 ms late.

## What's in it

- **Hear the difference**: both versions on proportionally spaced staves.
  Loop either one, or alternate A/B, with optional sixteenth or triplet
  background ticks.
- **Which one?**: ear training. Hear a rhythm and say whether it was
  played as written or swung. Keeps score and a streak.
- **Tap it**: tap the written rhythm over a click. You get a score and a
  *swing index* for your off-beat notes (0 = as written, 1 = triplet).
  Constant device latency is estimated from your on-beat taps and removed
  from the score.

## Run it

Plain ES modules, no build step. Browsers won't load modules from
`file://`, so serve it:

```sh
npm start          # http://127.0.0.1:8080
```

## Test it

```sh
npm test           # unit tests (node:test, no dependencies)
npm run shots      # headless-Chrome screenshots + end-to-end smoke run
```

`npm run shots` needs a system Chrome and `npm install` (puppeteer-core).
It plays a real "Tap it" take with synthetic key presses and fails if the
score isn't ≥ 85 or there are console errors. Output: `build/shots/`.

## Layout

| File | Role |
| --- | --- |
| `src/patterns.js` | The two bars in straight and swung notation, note-aligned |
| `src/timeline.js` | Pattern + tempo → absolute note and click times |
| `src/scoring.js` | Tap matching, latency estimate, swing index |
| `src/quiz.js` | "Which one?" state, with a cap on same-answer runs |
| `src/notation.js` | Minimal SVG rhythm engraver |
| `src/audio.js` | Web Audio synth, scheduler and tap clock |
| `src/main.js` | DOM wiring |

The score PDF is gitignored (it's copyrighted); keep it alongside locally.
