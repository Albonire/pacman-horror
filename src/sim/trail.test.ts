import { describe, expect, it } from "vitest";
import { PlayerTrail, Trail } from "./trail";

describe("PlayerTrail", () => {
  it("interpolates position linearly at intermediate timestamps", () => {
    const trail = new PlayerTrail(10);
    trail.push(1.0, 10, 20);
    trail.push(2.0, 20, 40);
    trail.push(4.0, 40, 80);

    // exact bounds
    const atStart = trail.at(1.0);
    expect(atStart).not.toBeNull();
    expect(atStart?.x).toBeCloseTo(10);
    expect(atStart?.z).toBeCloseTo(20);

    const atEnd = trail.at(4.0);
    expect(atEnd).not.toBeNull();
    expect(atEnd?.x).toBeCloseTo(40);
    expect(atEnd?.z).toBeCloseTo(80);

    // midway first segment (t = 1.5)
    const mid1 = trail.at(1.5);
    expect(mid1).not.toBeNull();
    expect(mid1?.x).toBeCloseTo(15);
    expect(mid1?.z).toBeCloseTo(30);

    // quarter way second segment (t = 2.5)
    const mid2 = trail.at(2.5);
    expect(mid2).not.toBeNull();
    expect(mid2?.x).toBeCloseTo(25);
    expect(mid2?.z).toBeCloseTo(50);

    // out of bounds returns null
    expect(trail.at(0.5)).toBeNull();
    expect(trail.at(4.5)).toBeNull();
    expect(trail.at(NaN)).toBeNull();
  });

  it("truncates old samples beyond retention window", () => {
    const maxAge = 4.0;
    const trail = new Trail(maxAge);

    trail.push(1.0, 10, 10);
    trail.push(3.0, 30, 30);
    trail.push(5.0, 50, 50);
    expect(trail.at(1.0)).not.toBeNull();

    // push sample at t = 7.0; age of t = 1.0 is 6.0 (> maxAge 4.0)
    trail.push(7.0, 70, 70);

    // sample at 1.0 is dropped
    expect(trail.at(1.0)).toBeNull();
    // sample at 3.0 is within 7.0 - 4.0 = 3.0 window
    expect(trail.at(3.0)).not.toBeNull();
    expect(trail.span).toBeLessThanOrEqual(maxAge + 0.1);

    // pushing further at t = 12.0 drops older points up to t = 8.0
    trail.push(12.0, 120, 120);
    expect(trail.at(3.0)).toBeNull();
    expect(trail.at(5.0)).toBeNull();
    expect(trail.at(7.0)).toBeNull();
    expect(trail.at(12.0)).not.toBeNull();
  });

  it("clears all samples and resets state", () => {
    const trail = new PlayerTrail(8);
    expect(trail.empty).toBe(true);
    expect(trail.span).toBe(0);

    trail.push(1.0, 10, 15);
    trail.push(2.0, 20, 25);
    expect(trail.empty).toBe(false);
    expect(trail.span).toBeCloseTo(1.0);

    trail.clear();
    expect(trail.empty).toBe(true);
    expect(trail.span).toBe(0);
    expect(trail.at(1.5)).toBeNull();
  });

  it("handles duplicate timestamps and non-finite values safely", () => {
    const trail = new PlayerTrail(8);
    trail.push(1.0, 10, 20);
    // duplicate timestamp updates last position without creating new sample
    trail.push(1.0, 12, 22);

    expect(trail.span).toBe(0);
    const sample = trail.at(1.0);
    expect(sample?.x).toBe(12);
    expect(sample?.z).toBe(22);

    // non-finite values are ignored
    trail.push(NaN, 10, 20);
    trail.push(2.0, Infinity, 30);
    trail.push(2.0, 30, -Infinity);
    expect(trail.span).toBe(0);

    // single-sample buffer behavior
    expect(trail.at(1.0)).not.toBeNull();
    expect(trail.at(1.01)).toBeNull();
    expect(trail.at(0.99)).toBeNull();

    // rewound timestamps discard newer samples to maintain monotonic order
    trail.push(3.0, 30, 30);
    trail.push(5.0, 50, 50);
    expect(trail.at(5.0)).not.toBeNull();
    trail.push(4.0, 40, 40);
    expect(trail.at(5.0)).toBeNull();
    expect(trail.at(4.0)?.x).toBe(40);
  });
});
