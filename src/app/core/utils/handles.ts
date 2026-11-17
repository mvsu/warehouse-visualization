import {
  Box,
  Point,
  ViewTransform,
  boxCenter,
  normalizeAngle,
  rotatePoint,
  toDeg,
} from './geometry';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export interface Handle {
  id: HandleId;
  /** Direction of the handle from the box centre: -1, 0 or 1 on each axis. */
  hx: number;
  hy: number;
  /** Screen position. */
  x: number;
  y: number;
  cursor: string;
}

export const HANDLE_SIZE = 8;
export const ROTATE_HANDLE_OFFSET = 26;

const DIRECTIONS: [HandleId, number, number][] = [
  ['nw', -1, -1],
  ['ne', 1, -1],
  ['se', 1, 1],
  ['sw', -1, 1],
  ['n', 0, -1],
  ['e', 1, 0],
  ['s', 0, 1],
  ['w', -1, 0],
];

function resizeCursor(hx: number, hy: number, rotation: number): string {
  const angle = normalizeAngle(toDeg(Math.atan2(hy, hx)) + rotation) % 180;
  if (angle < 22.5 || angle >= 157.5) return 'ew-resize';
  if (angle < 67.5) return 'nwse-resize';
  if (angle < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

/** Screen-space edit handles for a single selected box. */
export function getHandles(b: Box, t: ViewTransform, allowResize = true): Handle[] {
  const c = boxCenter(b);
  const w = b.width * t.scale;
  const h = b.height * t.scale;
  const handles: Handle[] = [];
  for (const [id, hx, hy] of allowResize ? DIRECTIONS : []) {
    // Edge handles are dropped on small objects so the corners stay easy to grab.
    if (hy === 0 && h < 28) continue;
    if (hx === 0 && w < 28) continue;
    const p = rotatePoint(
      { x: c.x + (hx * b.width) / 2, y: c.y + (hy * b.height) / 2 },
      c,
      b.rotation,
    );
    handles.push({
      id,
      hx,
      hy,
      x: p.x * t.scale + t.offsetX,
      y: p.y * t.scale + t.offsetY,
      cursor: resizeCursor(hx, hy, b.rotation),
    });
  }
  const top = rotatePoint({ x: c.x, y: b.y - ROTATE_HANDLE_OFFSET / t.scale }, c, b.rotation);
  handles.push({
    id: 'rotate',
    hx: 0,
    hy: -1,
    x: top.x * t.scale + t.offsetX,
    y: top.y * t.scale + t.offsetY,
    cursor: 'grab',
  });
  return handles;
}

export function hitHandle(
  b: Box,
  t: ViewTransform,
  screen: Point,
  allowResize = true,
): Handle | null {
  const reach = HANDLE_SIZE / 2 + 4;
  for (const h of getHandles(b, t, allowResize)) {
    if (Math.abs(screen.x - h.x) <= reach && Math.abs(screen.y - h.y) <= reach) return h;
  }
  return null;
}
