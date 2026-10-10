// Quiz state: run-length cap, answer checking, and running stats.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createQuiz, emptyStats } from "../src/quiz.js";

const always = (value) => () => value;

test("never asks the same feel more than three times running", () => {
  const quiz = createQuiz({ rng: always(0.1) }); // would always pick straight
  const asked = [];
  for (let i = 0; i < 8; i++) {
    asked.push(quiz.next());
    quiz.answer("straight");
  }
  assert.deepEqual(asked, ["straight", "straight", "straight", "swung", "straight", "straight", "straight", "swung"]);
});

test("rng below 0.5 is straight, otherwise swung", () => {
  assert.equal(createQuiz({ rng: always(0.49) }).next(), "straight");
  assert.equal(createQuiz({ rng: always(0.5) }).next(), "swung");
});

test("answers update totals, streaks and per-feel accuracy", () => {
  const quiz = createQuiz({ rng: always(0.9) });
  quiz.next();
  assert.deepEqual(quiz.answer("swung"), { correct: true, actual: "swung" });
  quiz.next();
  quiz.answer("swung");
  quiz.next();
  assert.deepEqual(quiz.answer("straight"), { correct: false, actual: "swung" });

  const s = quiz.stats;
  assert.equal(s.total, 3);
  assert.equal(s.correct, 2);
  assert.equal(s.streak, 0);
  assert.equal(s.bestStreak, 2);
  assert.deepEqual(s.byFeel.swung, { asked: 3, correct: 2 });
  assert.deepEqual(s.byFeel.straight, { asked: 0, correct: 0 });
});

test("answering twice, or before a question, is an error", () => {
  const quiz = createQuiz();
  assert.throws(() => quiz.answer("straight"));
  quiz.next();
  quiz.answer("straight");
  assert.throws(() => quiz.answer("straight"));
});

test("rejects answers that aren't a feel", () => {
  const quiz = createQuiz();
  quiz.next();
  assert.throws(() => quiz.answer("shuffle"));
});

test("resumes from saved stats", () => {
  const saved = { ...emptyStats(), total: 10, correct: 7, streak: 2, bestStreak: 5 };
  const quiz = createQuiz({ rng: always(0.1), stats: saved });
  quiz.next();
  quiz.answer("straight");
  assert.equal(quiz.stats.total, 11);
  assert.equal(quiz.stats.streak, 3);
  assert.equal(quiz.stats.bestStreak, 5);
});
