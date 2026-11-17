export interface RulerPaintOptions {
  axis: 'x' | 'y';
  /** Length of the ruler in CSS pixels. */
  length: number;
  thickness: number;
  dpr: number;
  /** Screen pixels per world unit and screen position of world 0 along this axis. */
  scale: number;
  offset: number;
  major: number;
  minor: number;
  worldMax: number;
  /** Pointer position along the ruler in CSS pixels. */
  mouse: number | null;
  /** World range covered by the selection, drawn as a tinted band. */
  highlight: [number, number] | null;
}

const FONT = '10px Inter, system-ui, sans-serif';

/**
 * Paints one ruler. Tick positions use exactly the same world→screen formula as the canvas grid
 * (round(value × scale + offset) + 0.5), so ticks and grid lines always line up.
 */
export function paintRuler(ctx: CanvasRenderingContext2D, o: RulerPaintOptions): void {
  const horizontal = o.axis === 'x';
  const width = horizontal ? o.length : o.thickness;
  const height = horizontal ? o.thickness : o.length;
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, width, height);

  const toScreen = (v: number) => v * o.scale + o.offset;
  const line = (pos: number, from: number, to: number) => {
    if (horizontal) {
      ctx.moveTo(pos, from);
      ctx.lineTo(pos, to);
    } else {
      ctx.moveTo(from, pos);
      ctx.lineTo(to, pos);
    }
  };

  if (o.highlight) {
    const a = Math.max(0, toScreen(o.highlight[0]));
    const b = Math.min(o.length, toScreen(o.highlight[1]));
    if (b > a) {
      ctx.fillStyle = 'rgba(37,99,235,0.14)';
      if (horizontal) ctx.fillRect(a, 0, b - a, o.thickness);
      else ctx.fillRect(0, a, o.thickness, b - a);
    }
  }

  // Only the ticks inside the visible range are generated.
  const first = Math.max(0, Math.ceil(-o.offset / o.scale / o.minor));
  const last = Math.floor(Math.min(o.worldMax, (o.length - o.offset) / o.scale) / o.minor);
  const perMajor = Math.round(o.major / o.minor);
  const half = perMajor % 2 === 0 ? perMajor / 2 : 0;

  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = first; i <= last; i++) {
    const pos = Math.round(toScreen(i * o.minor)) + 0.5;
    const isMajor = i % perMajor === 0;
    const size = isMajor ? o.thickness : half && i % half === 0 ? o.thickness * 0.5 : o.thickness * 0.28;
    line(pos, o.thickness - size, o.thickness);
  }
  ctx.stroke();

  // Labels sit on major ticks, which are at least ~64px apart, so they cannot overlap.
  ctx.fillStyle = '#475569';
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  for (let i = Math.ceil(first / perMajor) * perMajor; i <= last; i += perMajor) {
    const value = Math.round(i * o.minor * 1000) / 1000;
    const pos = Math.round(toScreen(value));
    const text = value.toLocaleString('en-US');
    if (horizontal) {
      ctx.textAlign = 'left';
      ctx.fillText(text, pos + 4, 8);
    } else {
      ctx.save();
      ctx.translate(8, pos + 4);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'right';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }

  if (o.mouse !== null && o.mouse >= 0 && o.mouse <= o.length) {
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    line(Math.round(o.mouse) + 0.5, 0, o.thickness);
    ctx.stroke();
  }

  ctx.strokeStyle = '#E2E8F0';
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(0, o.thickness - 0.5);
    ctx.lineTo(o.length, o.thickness - 0.5);
  } else {
    ctx.moveTo(o.thickness - 0.5, 0);
    ctx.lineTo(o.thickness - 0.5, o.length);
  }
  ctx.stroke();
}
