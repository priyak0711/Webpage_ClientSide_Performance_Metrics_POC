/**
 * Perceived Speed Index approximation (see README for methodology and
 * limitations vs. Lighthouse's real Speed Index).
 */
class SpeedIndexApproximator {
  constructor(opts = {}) {
    this.sampleIntervalMs = opts.sampleIntervalMs || 1500;
    this.maxDurationMs = opts.maxDurationMs || 120000;
    this.onComplete = opts.onComplete || function () {};
    this.samples = [];
    this._targets = [];
    this._startTime = performance.now();
    this._finished = false;

    this._collectTargets();
    this._tick = this._tick.bind(this);
    this._timer = setInterval(this._tick, this.sampleIntervalMs);
    setTimeout(() => this._finish(), this.maxDurationMs);
  }

  _collectTargets() {
    // Cap element count for very large pages (e.g. amazon.com) to keep sampling cheap
    const all = document.querySelectorAll('body *');
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    let count = 0;
    for (const el of all) {
      if (count >= 800) break;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top < vh && rect.left < vw) {
        this._targets.push(el);
        count++;
      }
    }
  }

  _visualProgress() {
    if (this._targets.length === 0) return 1;
    let painted = 0;
    for (const el of this._targets) {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const hasSize = rect.width > 0 && rect.height > 0;
      const isVisible =
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        parseFloat(style.opacity) > 0;
      if (hasSize && isVisible) painted++;
    }
    return painted / this._targets.length;
  }

  _tick() {
    if (this._finished) return;
    const elapsed = performance.now() - this._startTime;
    const progress = this._visualProgress();
    this.samples.push({ t: elapsed, progress });
    if (progress >= 0.999 && document.readyState === 'complete') {
      this._finish();
    }
  }

  _finish() {
    if (this._finished) return;
    this._finished = true;
    clearInterval(this._timer);

    let speedIndex = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const prev = this.samples[i - 1];
      const curr = this.samples[i];
      const dt = curr.t - prev.t;
      const avgIncomplete = 1 - (prev.progress + curr.progress) / 2;
      speedIndex += dt * avgIncomplete;
    }
    this.onComplete(Math.round(speedIndex), this.samples);
  }
}

window.SpeedIndexApproximator = SpeedIndexApproximator;
