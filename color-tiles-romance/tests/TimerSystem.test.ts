import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TimerSystem } from '@/core/TimerSystem';

describe('TimerSystem', () => {
  let timer: TimerSystem;

  beforeEach(() => {
    vi.useFakeTimers();
    timer = new TimerSystem();
  });

  afterEach(() => {
    timer.stop();
    vi.useRealTimers();
  });

  it('指定秒数で開始する', () => {
    timer.start(10);
    expect(timer.remain).toBe(10);
    expect(timer.isRunning).toBe(true);
  });

  it('1秒ごとに残り時間が減る', () => {
    timer.start(5);
    vi.advanceTimersByTime(1000);
    expect(timer.remain).toBe(4);
    vi.advanceTimersByTime(2000);
    expect(timer.remain).toBe(2);
  });

  it('0になるとstopしてtimeUpを発火する', () => {
    timer.start(2);
    let timeUpFired = false;
    timer.onTimeUp(() => (timeUpFired = true));
    vi.advanceTimersByTime(2000);
    expect(timer.remain).toBe(0);
    expect(timer.isRunning).toBe(false);
    expect(timeUpFired).toBe(true);
  });

  it('add でボーナス時間が加算される', () => {
    timer.start(10);
    timer.add(5);
    expect(timer.remain).toBe(15);
  });

  it('subtract で時間が減る', () => {
    timer.start(10);
    timer.subtract(3);
    expect(timer.remain).toBe(7);
  });

  it('subtract で0以下にならない', () => {
    timer.start(2);
    timer.subtract(10);
    expect(timer.remain).toBe(0);
  });

  it('subtract で0になったらtimeUpが発火する', () => {
    timer.start(3);
    let timeUpFired = false;
    timer.onTimeUp(() => (timeUpFired = true));
    timer.subtract(3);
    expect(timeUpFired).toBe(true);
  });

  it('pause/resume が動作する', () => {
    timer.start(10);
    timer.pause();
    vi.advanceTimersByTime(2000);
    expect(timer.remain).toBe(10);
    timer.resume();
    vi.advanceTimersByTime(2000);
    expect(timer.remain).toBe(8);
  });

  it('freeze で一定時間止まる', () => {
    timer.start(10);
    timer.freeze(2000);
    vi.advanceTimersByTime(1000);
    expect(timer.remain).toBe(10); // 凍結中
    vi.advanceTimersByTime(1500);  // freezeが切れる
    vi.advanceTimersByTime(1000);  // 1秒減る
    expect(timer.remain).toBe(9);
  });

  it('onTick リスナーが各秒で呼ばれる', () => {
    timer.start(3);
    const ticks: number[] = [];
    timer.onTick((sec) => ticks.push(sec));
    // start時にも notifyTick が走る
    expect(ticks[0]).toBe(3);
    vi.advanceTimersByTime(3000);
    expect(ticks).toContain(2);
    expect(ticks).toContain(1);
    expect(ticks).toContain(0);
  });
});
