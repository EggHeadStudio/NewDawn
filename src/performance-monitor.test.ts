import { describe, expect, it } from 'vitest';
import { FrameSamples, SustainedBenchmark } from './performance-monitor';

describe('frame samples', () => {
  it('calculates frame timing statistics and resets after interruption', () => {
    const samples = new FrameSamples();
    [0, 10, 30, 60, 100].forEach(time => samples.record(time));
    expect(samples.summary()).toMatchObject({ count: 4, fps: 25, averageFps: 40, medianFps: 40, meanMs: 25, p95Ms: 40 });
    samples.reset();
    samples.record(1000);
    expect(samples.summary()).toBeNull();
  });

  it('keeps only the latest 300 frame durations', () => {
    const samples = new FrameSamples();
    for (let i = 0; i <= 350; i++) samples.record(i * 20);
    samples.record(7020);
    expect(samples.summary()).toMatchObject({ count: 300, fps: 50, meanMs: 20, p95Ms: 20 });
  });
});

describe('sustained benchmark', () => {
  it('records a complete 30-second interval with long-frame spikes', () => {
    const benchmark = new SustainedBenchmark();
    expect(benchmark.record(0)).toBe('running');
    for (let time = 10; time < 29900; time += 10) benchmark.record(time);
    expect(benchmark.record(30000)).toBe('complete');
    expect(benchmark.elapsedMs).toBe(30000);
    expect(benchmark.summary()).toMatchObject({ count: 2990, spikes: 1 });
    expect(benchmark.summary()!.p95Ms).toBe(10);
  });

  it('reports an overflow rather than silently dropping frames', () => {
    const benchmark = new SustainedBenchmark();
    benchmark.record(0);
    for (let i = 1; i < benchmark.maxSamples; i++) benchmark.record(i / 10);
    expect(benchmark.record(benchmark.maxSamples / 10)).toBe('running');
    expect(benchmark.record((benchmark.maxSamples + 1) / 10)).toBe('overflow');
  });
});
