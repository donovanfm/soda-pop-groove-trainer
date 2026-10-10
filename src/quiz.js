/*
 * quiz.js — state for the "Which one did you hear?" drill.
 *
 * Picks straight or swung at random (with an injectable RNG for tests),
 * but never more than `maxRun` of the same answer in a row: with pure
 * coin flips a player who always guesses "straight" can coast through a
 * lucky streak, and long runs make people second-guess what they heard.
 *
 * Holds no audio or DOM; main.js asks it what to play and reports the
 * answer back.
 */

import { FEELS } from "./patterns.js";

export function emptyStats() {
  return {
    total: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    byFeel: { straight: { asked: 0, correct: 0 }, swung: { asked: 0, correct: 0 } },
  };
}

export function createQuiz({ rng = Math.random, maxRun = 3, stats = emptyStats() } = {}) {
  const history = [];
  let current = null;

  function next() {
    let feel = rng() < 0.5 ? "straight" : "swung";
    const recent = history.slice(-maxRun);
    if (recent.length === maxRun && recent.every((f) => f === feel)) {
      feel = feel === "straight" ? "swung" : "straight";
    }
    current = feel;
    return feel;
  }

  function answer(guess) {
    if (current === null) throw new Error("No question asked yet");
    if (!FEELS.includes(guess)) throw new Error(`Unknown answer "${guess}"`);
    const actual = current;
    const correct = guess === actual;
    history.push(actual);
    current = null;

    stats.total += 1;
    stats.byFeel[actual].asked += 1;
    if (correct) {
      stats.correct += 1;
      stats.byFeel[actual].correct += 1;
      stats.streak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    } else {
      stats.streak = 0;
    }
    return { correct, actual };
  }

  return {
    next,
    answer,
    get current() {
      return current;
    },
    get stats() {
      return stats;
    },
  };
}
