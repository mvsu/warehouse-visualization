import { Injectable } from '@angular/core';
import { Bounds, Point } from '../utils/geometry';

/** Alignment guide shown while an object snaps to another object. Coordinates are in world units. */
export interface Guide {
  /** 'x' = vertical line at x = position, 'y' = horizontal line at y = position. */
  axis: 'x' | 'y';
  position: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

/** Grid, ruler and snapping maths. Stateless: everything is derived from the current scale. */
@Injectable({ providedIn: 'root' })
export class CoordinateService {
  /**
   * Ruler intervals: labels are spaced at least ~64px apart so they never overlap,
   * and minor ticks coincide with the visible grid lines.
   */
  rulerSteps(scale: number, gridStep: number): { major: number; minor: number } {
    const cellsPerLabel = Math.max(1, Math.ceil(64 / Math.max(1, gridStep * scale)));
    return { major: gridStep * cellsPerLabel, minor: gridStep };
  }

  snap(value: number, step: number): number {
    return Math.round(value / step) * step;
  }

  snapPoint(p: Point, stepX: number, stepY = stepX): Point {
    return { x: this.snap(p.x, stepX), y: this.snap(p.y, stepY) };
  }

  format(value: number): string {
    return Math.round(value).toLocaleString('en-US');
  }

  /**
   * Snaps a moving bounding box to the edges and centres of other boxes.
   * Returns the correction to apply plus the guides to display. Axes without a match return 0.
   */
  snapBounds(moving: Bounds, others: Bounds[], threshold: number): SnapResult {
    const result: SnapResult = { dx: 0, dy: 0, guides: [] };
    const edges = (start: number, size: number) => [start, start + size / 2, start + size];

    const solve = (axis: 'x' | 'y'): number => {
      const horizontal = axis === 'x';
      const mine = horizontal ? edges(moving.x, moving.width) : edges(moving.y, moving.height);
      let best = threshold;
      let delta = 0;
      for (const o of others) {
        const theirs = horizontal ? edges(o.x, o.width) : edges(o.y, o.height);
        for (const m of mine) {
          for (const t of theirs) {
            const d = Math.abs(t - m);
            if (d < best) {
              best = d;
              delta = t - m;
            }
          }
        }
      }
      if (best >= threshold) return 0;
      // Collect a guide for every box that lines up after the correction.
      const moved = mine.map((m) => m + delta);
      const crossStart = horizontal ? moving.y : moving.x;
      const crossSize = horizontal ? moving.height : moving.width;
      for (const o of others) {
        const theirs = horizontal ? edges(o.x, o.width) : edges(o.y, o.height);
        const oStart = horizontal ? o.y : o.x;
        const oSize = horizontal ? o.height : o.width;
        for (const t of theirs) {
          if (moved.some((m) => Math.abs(m - t) < 1e-6)) {
            result.guides.push({
              axis,
              position: t,
              from: Math.min(crossStart, oStart),
              to: Math.max(crossStart + crossSize, oStart + oSize),
            });
          }
        }
      }
      return delta;
    };

    result.dx = solve('x');
    result.dy = solve('y');
    return result;
  }
}
