export class FrameSamples {
  private readonly samples: number[] = [];
  private index = 0;
  private previous: number | null = null;

  reset() {
    this.samples.length = 0;
    this.index = 0;
    this.previous = null;
  }

  record(now: number) {
    if (this.previous !== null) {
      const duration = now - this.previous;
      if (Number.isFinite(duration) && duration > 0) {
        this.samples[this.index] = duration;
        this.index = (this.index + 1) % 300;
      }
    }
    this.previous = now;
  }

  summary() {
    const result = summarize(this.samples);
    if (!result) return null;
    const latest = this.samples[(this.index + this.samples.length - 1) % this.samples.length];
    return { ...result, fps: 1000 / latest };
  }
}

function summarize(samples: number[]) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { count: sorted.length, averageFps: 1000 / mean, medianFps: 1000 / median,
    meanMs: mean, p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    spikes: sorted.filter(value => value > 50).length };
}

export class SustainedBenchmark {
  private samples: number[] = [];
  private started: number | null = null;
  private previous: number | null = null;
  private finished = false;
  readonly durationMs = 30000;
  readonly maxSamples = 18000;

  record(now: number): 'running' | 'complete' | 'overflow' {
    if (this.finished) return 'complete';
    if (this.started === null || this.previous === null) {
      this.started = now;
      this.previous = now;
      return 'running';
    }
    const duration = now - this.previous;
    if (Number.isFinite(duration) && duration > 0) {
      if (this.samples.length >= this.maxSamples) return 'overflow';
      this.samples.push(duration);
      this.previous = now;
    }
    if (now - this.started >= this.durationMs) {
      this.finished = true;
      return 'complete';
    }
    return 'running';
  }

  get elapsedMs() { return this.started === null || this.previous === null ? 0 : this.previous - this.started; }
  summary() { return summarize(this.samples); }
}
