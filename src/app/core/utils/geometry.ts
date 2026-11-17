/** Pure geometry helpers shared by the renderer, tools and services. All angles are degrees. */

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rectangle rotated around its own centre. */
export interface Box extends Bounds {
  rotation: number;
}

/** screen = world * scale + offset */
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const toRad = (deg: number): number => (deg * Math.PI) / 180;
export const toDeg = (rad: number): number => (rad * 180) / Math.PI;
export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
export const normalizeAngle = (deg: number): number => ((deg % 360) + 360) % 360;
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export function round(v: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export function rotatePoint(p: Point, c: Point, deg: number): Point {
  if (!deg) return { x: p.x, y: p.y };
  const r = toRad(deg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

export const boxCenter = (b: Bounds): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Corners in order: top-left, top-right, bottom-right, bottom-left (after rotation). */
export function boxCorners(b: Box): Point[] {
  const c = boxCenter(b);
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ].map((p) => rotatePoint(p, c, b.rotation));
}

/** Axis-aligned bounding box of a rotated box. */
export function boxAabb(b: Box): Bounds {
  if (!(b.rotation % 360)) return { x: b.x, y: b.y, width: b.width, height: b.height };
  const pts = boxCorners(b);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** Converts a world point to the box's local space (origin = unrotated top-left corner). */
export function toLocal(p: Point, b: Box): Point {
  const q = rotatePoint(p, boxCenter(b), -b.rotation);
  return { x: q.x - b.x, y: q.y - b.y };
}

export function pointInBox(p: Point, b: Box, tolerance = 0): boolean {
  const l = toLocal(p, b);
  return l.x >= -tolerance && l.y >= -tolerance && l.x <= b.width + tolerance && l.y <= b.height + tolerance;
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (!list.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of list) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function boundsFromPoints(a: Point, b: Point): Bounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

