/*
 * audio.js — Web Audio playback and the clock that tap scoring uses.
 *
 * Everything is scheduled ahead on AudioContext time (never setTimeout),
 * because the difference this app teaches is ~40 ms and JS timers jitter
 * by more than that. Each playback gets its own "bus" (a GainNode), so
 * stopping is just fading and disconnecting that bus; no bookkeeping of
 * individual oscillators.
 *
 * Sounds are synthesized, so there are no assets to load: a clarinet-ish
 * voice (odd-harmonic periodic wave through a lowpass, like a cylindrical
 * bore) and a woodblock-ish click for the metronome.
 *
 * heardTime() and tapTime() convert between the performance clock (DOM
 * events, rAF) and "what context time is coming out of the speaker
 * right now", using getOutputTimestamp() so output latency is accounted
 * for where the browser reports it.
 */

const CLARINET_HARMONICS = [0, 1, 0.03, 0.72, 0.03, 0.46, 0.02, 0.28, 0.02, 0.18, 0, 0.1, 0, 0.06];
const FADE_OUT = 0.03;

export function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class AudioEngine {
  #ctx = null;
  #master = null;
  #wave = null;

  get ready() {
    return this.#ctx !== null && this.#ctx.state === "running";
  }

  /** Must be called from a user gesture the first time (autoplay policy). */
  async ensure() {
    if (!this.#ctx) {
      // iOS: play through the silent switch like a music app would.
      if (navigator.audioSession) navigator.audioSession.type = "playback";
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.#ctx = new Ctx({ latencyHint: "interactive" });
      this.#master = this.#ctx.createGain();
      this.#master.gain.value = 0.8;
      this.#master.connect(this.#ctx.destination);
      const imag = new Float32Array(CLARINET_HARMONICS);
      this.#wave = this.#ctx.createPeriodicWave(new Float32Array(imag.length), imag);
    }
    if (this.#ctx.state !== "running") await this.#ctx.resume();
    return this;
  }

  get currentTime() {
    return this.#ctx.currentTime;
  }

  /** Context time of the sound reaching the speaker at performance time `perfMs`. */
  #heardAt(perfMs) {
    const ctx = this.#ctx;
    if (ctx.getOutputTimestamp) {
      const { contextTime, performanceTime } = ctx.getOutputTimestamp();
      if (performanceTime > 0) return contextTime + (perfMs - performanceTime) / 1000;
    }
    const latency = ctx.outputLatency || ctx.baseLatency || 0;
    return ctx.currentTime - (performance.now() - perfMs) / 1000 - latency;
  }

  /** The context time you are hearing right now (for playheads). */
  heardTime() {
    return this.#heardAt(performance.now());
  }

  /** Converts a DOM event's timeStamp into heard context time. */
  tapTime(eventTimeStamp) {
    return this.#heardAt(eventTimeStamp);
  }

  createBus() {
    const ctx = this.#ctx;
    const node = ctx.createGain();
    node.connect(this.#master);
    let stopped = false;
    return {
      node,
      get stopped() {
        return stopped;
      },
      stop() {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        node.gain.cancelScheduledValues(t);
        node.gain.setValueAtTime(node.gain.value, t);
        node.gain.linearRampToValueAtTime(0, t + FADE_OUT);
        setTimeout(() => node.disconnect(), (FADE_OUT + 0.05) * 1000);
      },
    };
  }

  note(bus, time, duration, midi, accent) {
    const ctx = this.#ctx;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.#wave);
    osc.frequency.value = midiToHz(midi);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = accent ? 2600 : 2000;
    filter.Q.value = 0.6;

    const peak = accent ? 0.34 : 0.24;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(peak, time + 0.008);
    env.gain.exponentialRampToValueAtTime(peak * 0.7, time + 0.008 + Math.max(0.02, duration * 0.6));
    env.gain.setValueAtTime(peak * 0.7, time + duration);
    env.gain.linearRampToValueAtTime(0, time + duration + 0.035);

    osc.connect(filter).connect(env).connect(bus.node);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  click(bus, time, { accent = false, quiet = false } = {}) {
    const ctx = this.#ctx;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = quiet ? 3200 : accent ? 1900 : 1350;

    const env = ctx.createGain();
    const peak = quiet ? 0.07 : accent ? 0.5 : 0.32;
    const length = quiet ? 0.018 : 0.045;
    env.gain.setValueAtTime(peak, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + length);

    osc.connect(env).connect(bus.node);
    osc.start(time);
    osc.stop(time + length + 0.01);
  }

  /**
   * Schedules a timeline from timeline.js onto a bus.
   * @param {"all"|"countIn"|"none"} clicks  which metronome clicks to sound
   * @param {number[]} [subdivisions]        extra quiet ticks, as beat fractions (e.g. [1/4, 1/2, 3/4])
   */
  schedule(bus, timeline, { clicks = "all", notes = true, subdivisions = [] } = {}) {
    for (const c of timeline.clicks) {
      if (clicks === "all" || (clicks === "countIn" && c.countIn)) this.click(bus, c.time, { accent: c.accent });
      if (!c.countIn) {
        for (const frac of subdivisions) this.click(bus, c.time + frac * timeline.spb, { quiet: true });
      }
    }
    if (notes) {
      for (const n of timeline.notes) this.note(bus, n.time, n.duration, n.pitch, n.accent);
    }
  }
}
