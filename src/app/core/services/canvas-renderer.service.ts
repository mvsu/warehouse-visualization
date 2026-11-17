import { Injectable, signal } from '@angular/core';
import { Aisle } from '../../features/warehouse/models/aisle.model';
import {
  ImageObject,
  ShapeObject,
  TextLabel,
} from '../../features/warehouse/models/elements.model';
import { Rack, STOCK_COLORS } from '../../features/warehouse/models/rack.model';
import { Space } from '../../features/warehouse/models/space.model';
import { WarehouseObject } from '../../features/warehouse/models/warehouse-object.model';
import {
  Bounds,
  Point,
  ViewTransform,
  boundsIntersect,
  boxAabb,
  boxCorners,
  normalizeAngle,
  round,
  toRad,
  unionBounds,
} from '../utils/geometry';
import { HANDLE_SIZE, getHandles } from '../utils/handles';
import { Guide } from './coordinate.service';

export interface RenderOverlay {
  /** Drag-selection rectangle in world units. */
  marquee: Bounds | null;
  guides: Guide[];
  /** Object being drawn or about to be placed. */
  draft: WarehouseObject | null;
  /** Short read-out shown next to the pointer (dimensions, angle). */
  draftLabel: string | null;
  /** Start point of the wall segment being drawn. */
  anchor: Point | null;
}

/** View mode emphasis: faded objects and, per rack, the bay levels that stay fully visible. */
export interface RenderFocus {
  dim: ReadonlySet<string>;
  cells: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface RenderScene {
  width: number;
  height: number;
  dpr: number;
  transform: ViewTransform;
  /** Visible objects in drawing order (bottom first). */
  objects: WarehouseObject[];
  selection: WarehouseObject[];
  selectedCellId: string | null;
  focus?: RenderFocus | null;
  overlay: RenderOverlay;
  showGrid: boolean;
  gridCellWidth: number;
  gridCellHeight: number;
  worldWidth: number;
  worldHeight: number;
  showHandles: boolean;
  mouse: Point | null;
}

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
const PRIMARY = '#2563EB';
const GUIDE = '#DB2777';
const INK = '#0F172A';
const MUTED = '#475569';

interface TextOptions {
  maxWidth?: number;
  weight?: number;
  align?: CanvasTextAlign;
}

/**
 * Label size in screen pixels: follows the zoom between a readable minimum and a maximum,
 * and never exceeds `limit` (usually a fraction of the object's height).
 */
function labelPx(worldSize: number, scale: number, max: number, limit: number): number {
  return Math.min(max, Math.max(10, worldSize * scale), limit);
}

function rgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex ?? '');
  if (!m) return `rgba(100,116,139,${alpha})`;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Draws the warehouse onto a 2D canvas. It holds no application state: callers pass a scene.
 * Only objects intersecting the viewport are drawn (viewport culling), and the grid is generated
 * for the visible area only, so cost depends on what is on screen, never on the 20,000-pixel world.
 */
@Injectable({ providedIn: 'root' })
export class CanvasRendererService {
  /** Bumped whenever a floor-plan image finishes loading so canvases can repaint. */
  readonly imageTick = signal(0);

  private readonly images = new Map<string, HTMLImageElement>();
  /** True while drawing an object that is upside-down, so centred labels are flipped to stay readable. */
  private flip = false;
  /** Bay levels of the rack being drawn that stay fully visible; undefined = all of them. */
  private focusCells: ReadonlySet<string> | undefined;

  render(ctx: CanvasRenderingContext2D, scene: RenderScene): void {
    const { width, height, transform: t } = scene;
    ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.drawBackground(ctx, scene);
    this.drawObjects(ctx, scene.objects, t, { x: 0, y: 0, width, height }, scene.focus);
    this.drawSelection(ctx, scene);
    this.drawOverlay(ctx, scene);
  }

  /** Draws objects with viewport culling. `screen` is the visible screen rectangle. */
  drawObjects(
    ctx: CanvasRenderingContext2D,
    objects: WarehouseObject[],
    t: ViewTransform,
    screen: Bounds,
    focus?: RenderFocus | null,
  ): void {
    const pad = 40 / t.scale;
    const visible: Bounds = {
      x: (screen.x - t.offsetX) / t.scale - pad,
      y: (screen.y - t.offsetY) / t.scale - pad,
      width: screen.width / t.scale + pad * 2,
      height: screen.height / t.scale + pad * 2,
    };
    for (const o of objects) {
      if (!boundsIntersect(boxAabb(o), visible)) continue;
      this.focusCells = focus?.cells.get(o.id);
      this.drawObject(ctx, o, t, focus?.dim.has(o.id) ? 0.14 : 1);
    }
    this.focusCells = undefined;
  }

  drawObject(ctx: CanvasRenderingContext2D, o: WarehouseObject, t: ViewTransform, alpha = 1): void {
    const s = t.scale;
    const w = o.width * s;
    const h = o.height * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate((o.x + o.width / 2) * s + t.offsetX, (o.y + o.height / 2) * s + t.offsetY);
    if (o.rotation) ctx.rotate(toRad(o.rotation));
    ctx.translate(-w / 2, -h / 2);
    const rot = normalizeAngle(o.rotation);
    this.flip = rot > 90 && rot <= 270;
    ctx.lineJoin = 'miter';
    ctx.setLineDash([]);
    switch (o.type) {
      case 'rack':
        this.rack(ctx, o as Rack, w, h);
        break;
      case 'space':
        this.space(ctx, o as Space, w, h, s);
        break;
      case 'aisle':
        this.aisle(ctx, o as Aisle, w, h, s);
        break;
      case 'text':
        this.textLabel(ctx, o as TextLabel, h, s);
        break;
      case 'shape':
        this.shape(ctx, o as ShapeObject, w, h, s);
        break;
      case 'image':
        this.image(ctx, o as ImageObject, w, h);
        break;
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- background

  private drawBackground(ctx: CanvasRenderingContext2D, scene: RenderScene): void {
    const { width, height, transform: t } = scene;
    ctx.fillStyle = '#EEF1F5';
    ctx.fillRect(0, 0, width, height);

    // The world rectangle, clipped to the viewport.
    const x0 = Math.max(0, t.offsetX);
    const y0 = Math.max(0, t.offsetY);
    const x1 = Math.min(width, scene.worldWidth * t.scale + t.offsetX);
    const y1 = Math.min(height, scene.worldHeight * t.scale + t.offsetY);
    if (x1 <= x0 || y1 <= y0) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    if (scene.showGrid)
      this.drawGrid(ctx, t, scene.gridCellWidth, scene.gridCellHeight, x0, y0, x1, y1);
  }

  /** Generates only the grid lines that cross the visible part of the world. */
  private drawGrid(
    ctx: CanvasRenderingContext2D,
    t: ViewTransform,
    cellWidth: number,
    cellHeight: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): void {
    const left = (x0 - t.offsetX) / t.scale;
    const right = (x1 - t.offsetX) / t.scale;
    const top = (y0 - t.offsetY) / t.scale;
    const bottom = (y1 - t.offsetY) / t.scale;

    ctx.beginPath();
    for (let x = Math.ceil(left / cellWidth) * cellWidth; x <= right; x += cellWidth) {
      const sx = Math.round(x * t.scale + t.offsetX) + 0.5;
      ctx.moveTo(sx, y0);
      ctx.lineTo(sx, y1);
    }
    for (let y = Math.ceil(top / cellHeight) * cellHeight; y <= bottom; y += cellHeight) {
      const sy = Math.round(y * t.scale + t.offsetY) + 0.5;
      ctx.moveTo(x0, sy);
      ctx.lineTo(x1, sy);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.42)';
    ctx.stroke();
  }

  // ---------------------------------------------------------------- object painters

  private rack(ctx: CanvasRenderingContext2D, o: Rack, w: number, h: number): void {
    const cols = Math.max(1, o.columns);
    const rows = Math.max(1, o.rows);
    const s = w / o.width;
    const gapX = o.columnSpacing * s;
    const gapY = o.rowSpacing * s;
    const cw = o.cellWidth * s;
    const ch = o.cellHeight * s;

    if (cw < 3 || ch < 3) {
      // Level of detail: cells are too small to read, draw the rack as one block.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rgba(o.color, 0.24);
      ctx.fillRect(0, 0, w, h);
    } else {
      const fills: Record<string, string> = {
        Empty: rgba(STOCK_COLORS['Empty'], 0.9),
        'In Stock': rgba(STOCK_COLORS['In Stock'], 0.75),
        'Low Stock': rgba(STOCK_COLORS['Low Stock'], 0.85),
        Occupied: rgba(o.color, 0.4),
        Reserved: 'rgba(245,158,11,0.42)',
        Blocked: 'rgba(100,116,139,0.5)',
      };
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      const showIds = cw >= 30 && ch >= 14;
      const px = Math.min(10, ch * 0.45, cw * 0.28);
      const focus = this.focusCells;
      const alpha = ctx.globalAlpha;
      const lit: [number, number][] = [];
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * (cw + gapX);
          const y = r * (ch + gapY);
          const cell = o.cells[r * cols + c];
          if (focus) {
            const on = !!cell && focus.has(cell.id);
            ctx.globalAlpha = alpha * (on ? 1 : 0.14);
            if (on) lit.push([x, y]);
          }
          ctx.fillStyle = fills[cell?.status ?? 'Empty'] ?? fills['Empty'];
          ctx.fillRect(x, y, cw, ch);
          ctx.rect(x, y, cw, ch);
          if (showIds && cell)
            this.text(ctx, cell.positionId, x + cw / 2, y + ch / 2, px, rgba(o.color, 0.95));
        }
      }
      ctx.globalAlpha = alpha * (focus ? 0.3 : 1);
      ctx.strokeStyle = rgba(o.color, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      if (lit.length) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        for (const [x, y] of lit) ctx.strokeRect(x, y, cw, ch);
      }
    }
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, w, h);

    // Frame-style caption above the rack, at a constant readable size.
    if (w > 44) {
      const flip = this.flip;
      this.flip = false;
      this.text(ctx, o.label || o.name, 0, -8, 11, MUTED, { align: 'left', maxWidth: w });
      this.flip = flip;
    }
  }

  private space(ctx: CanvasRenderingContext2D, o: Space, w: number, h: number, s: number): void {
    const radius = Math.min(o.cornerRadius * s, w / 2, h / 2);
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, radius);
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * o.opacity;
    ctx.fillStyle = o.fillColor;
    ctx.fill();
    ctx.globalAlpha = alpha;
    if (o.spaceType === 'Restricted Area') this.hatch(ctx, w, h, rgba(o.borderColor, 0.28));
    ctx.strokeStyle = o.borderColor;
    ctx.lineWidth = 1.5;
    if (o.spaceType === 'Empty Space') ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!o.labelVisible || w < 48) return;
    const px = labelPx(9, s, 15, h * 0.3);
    const sub = Math.max(px * 0.78, 0);
    const hasSub = sub >= 7 && h > px * 3.2;
    this.text(ctx, o.name, w / 2, h / 2 - (hasSub ? px * 0.6 : 0), px, INK, {
      weight: 600,
      maxWidth: w - 12,
    });
    if (hasSub) {
      const area = round(o.width * o.height, 0).toLocaleString('en-US');
      this.text(ctx, `${o.spaceType}  ·  ${area} px²`, w / 2, h / 2 + px * 0.75, sub, MUTED, {
        maxWidth: w - 12,
      });
    }
  }

  private aisle(ctx: CanvasRenderingContext2D, o: Aisle, w: number, h: number, s: number): void {
    const [length, cross] = this.alongLongAxis(ctx, w, h, o.direction === 'Vertical', o.rotation);
    ctx.fillStyle = rgba(o.color, 0.32);
    ctx.fillRect(0, 0, length, cross);
    ctx.strokeStyle = rgba(o.color, 1);
    ctx.lineWidth = 1.25;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(length, 0);
    ctx.moveTo(0, cross);
    ctx.lineTo(length, cross);
    ctx.stroke();
    ctx.setLineDash([]);

    if (cross >= 8 && length >= 36) {
      const twoWay = o.travelType === 'Two-way';
      const dir = o.travelDirection === 'Reverse' ? -1 : 1;
      const size = Math.min(8, Math.max(3, cross * (twoWay ? 0.13 : 0.2)));
      const gap = Math.max(72, length / 30);
      const lanes = twoWay
        ? [
            { y: cross * 0.28, d: dir },
            { y: cross * 0.72, d: -dir },
          ]
        : [{ y: cross / 2, d: dir }];
      ctx.strokeStyle = 'rgba(15,23,42,0.5)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const lane of lanes) {
        for (let x = gap / 2; x < length; x += gap) {
          ctx.moveTo(x - lane.d * size * 0.6, lane.y - size);
          ctx.lineTo(x + lane.d * size * 0.6, lane.y);
          ctx.lineTo(x - lane.d * size * 0.6, lane.y + size);
        }
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    const px = labelPx(7, s, 12, cross * 0.42);
    if (length > 80)
      this.pill(
        ctx,
        o.name,
        length / 2,
        cross / 2,
        px,
        '#713F12',
        'rgba(255,255,255,0.88)',
        length - 24,
      );
  }

  private textLabel(ctx: CanvasRenderingContext2D, o: TextLabel, h: number, s: number): void {
    const px = o.fontSize * s;
    if (px < 3.5) return;
    ctx.font = `${o.bold ? 700 : 400} ${px}px ${FONT}`;
    ctx.fillStyle = o.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.name, 0, h / 2);
  }

  private shape(
    ctx: CanvasRenderingContext2D,
    o: ShapeObject,
    w: number,
    h: number,
    s: number,
  ): void {
    ctx.beginPath();
    switch (o.shapeKind) {
      case 'Circle':
      case 'Ellipse':
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        break;
      case 'Triangle':
        this.polygon(ctx, [
          [w / 2, 0],
          [w, h],
          [0, h],
        ]);
        break;
      default:
        ctx.rect(0, 0, w, h);
    }
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * o.opacity;
    ctx.fillStyle = o.fillColor;
    ctx.fill();
    ctx.globalAlpha = alpha;
    if (o.borderWidth > 0) {
      ctx.strokeStyle = o.borderColor;
      ctx.lineWidth = Math.max(0.75, o.borderWidth * Math.min(1, s));
      ctx.stroke();
    }
  }

  private image(ctx: CanvasRenderingContext2D, o: ImageObject, w: number, h: number): void {
    const img = this.loadImage(o.src);
    if (img) {
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * o.opacity;
      ctx.drawImage(img, 0, 0, w, h);
      ctx.globalAlpha = alpha;
    } else {
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#CBD5E1';
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(0, 0, w, h);
      ctx.setLineDash([]);
      this.text(ctx, 'Loading floor plan…', w / 2, h / 2, 12, MUTED, { maxWidth: w - 12 });
    }
  }

  private loadImage(src: string): HTMLImageElement | null {
    if (!src) return null;
    let img = this.images.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => this.imageTick.update((n) => n + 1);
      img.src = src;
      this.images.set(src, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  /** Resolves once every floor-plan image used by the objects has loaded (needed before exporting). */
  preloadImages(objects: WarehouseObject[]): Promise<void> {
    const pending = objects
      .filter(
        (o): o is ImageObject =>
          o.type === 'image' && !!(o as ImageObject).src && !this.loadImage((o as ImageObject).src),
      )
      .map((o) => {
        const img = this.images.get(o.src)!;
        return new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      });
    return Promise.all(pending).then(() => undefined);
  }

  // ---------------------------------------------------------------- selection & overlay

  private drawSelection(ctx: CanvasRenderingContext2D, scene: RenderScene): void {
    const { selection, transform: t } = scene;
    if (!selection.length) return;
    ctx.setLineDash([]);
    for (const o of selection) {
      this.outline(ctx, o, t, o.locked ? '#94A3B8' : PRIMARY, selection.length > 1 ? 1 : 1.5);
    }

    if (selection.length > 1) {
      const b = unionBounds(selection.map((o) => boxAabb(o)))!;
      ctx.strokeStyle = PRIMARY;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(
        b.x * t.scale + t.offsetX - 4,
        b.y * t.scale + t.offsetY - 4,
        b.width * t.scale + 8,
        b.height * t.scale + 8,
      );
      ctx.setLineDash([]);
      return;
    }

    const o = selection[0];
    if (o.type === 'rack' && scene.selectedCellId)
      this.cellHighlight(ctx, o as Rack, scene.selectedCellId, t);

    // Dimension badge under the selection.
    const box = boxAabb(o);
    const label = `${round(o.width, 1)} × ${round(o.height, 1)}`;
    const cx = (box.x + box.width / 2) * t.scale + t.offsetX;
    const by = (box.y + box.height) * t.scale + t.offsetY + 16;
    this.flip = false;
    this.pill(ctx, label, cx, by, 11, '#FFFFFF', PRIMARY);

    if (!scene.showHandles || o.locked) return;
    const handles = getHandles(o, t, o.type !== 'rack');
    const rotate = handles.find((hd) => hd.id === 'rotate')!;
    const topMid = handles.find((hd) => hd.id === 'n');
    const corners = boxCorners(o).map((p) => ({
      x: p.x * t.scale + t.offsetX,
      y: p.y * t.scale + t.offsetY,
    }));
    const anchor = topMid ?? {
      x: (corners[0].x + corners[1].x) / 2,
      y: (corners[0].y + corners[1].y) / 2,
    };
    ctx.strokeStyle = PRIMARY;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(rotate.x, rotate.y);
    ctx.stroke();
    for (const hd of handles) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = PRIMARY;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (hd.id === 'rotate') ctx.arc(hd.x, hd.y, 5, 0, Math.PI * 2);
      else ctx.rect(hd.x - HANDLE_SIZE / 2, hd.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      ctx.fill();
      ctx.stroke();
    }
  }

  private outline(
    ctx: CanvasRenderingContext2D,
    o: WarehouseObject,
    t: ViewTransform,
    color: string,
    width: number,
  ): void {
    const pts = boxCorners(o);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = p.x * t.scale + t.offsetX;
      const y = p.y * t.scale + t.offsetY;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  private cellHighlight(
    ctx: CanvasRenderingContext2D,
    rack: Rack,
    cellId: string,
    t: ViewTransform,
  ): void {
    const cell = rack.cells.find((c) => c.id === cellId);
    if (!cell) return;
    const s = t.scale;
    const cw = rack.cellWidth;
    const ch = rack.cellHeight;
    ctx.save();
    ctx.translate(
      (rack.x + rack.width / 2) * s + t.offsetX,
      (rack.y + rack.height / 2) * s + t.offsetY,
    );
    ctx.rotate(toRad(rack.rotation));
    ctx.translate((-rack.width * s) / 2, (-rack.height * s) / 2);
    const x = (cell.column - 1) * (cw + rack.columnSpacing) * s;
    const y = (cell.row - 1) * (ch + rack.rowSpacing) * s;
    ctx.fillStyle = 'rgba(37,99,235,0.22)';
    ctx.fillRect(x, y, cw * s, ch * s);
    ctx.strokeStyle = PRIMARY;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cw * s, ch * s);
    ctx.restore();
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, scene: RenderScene): void {
    const { overlay, transform: t, mouse } = scene;
    const sx = (x: number) => x * t.scale + t.offsetX;
    const sy = (y: number) => y * t.scale + t.offsetY;

    if (overlay.draft) {
      this.drawObject(ctx, overlay.draft, t, 0.65);
      ctx.setLineDash([4, 3]);
      this.outline(ctx, overlay.draft, t, PRIMARY, 1);
      ctx.setLineDash([]);
    }
    if (overlay.anchor) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = PRIMARY;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(overlay.anchor.x), sy(overlay.anchor.y), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (overlay.marquee) {
      const m = overlay.marquee;
      ctx.fillStyle = 'rgba(37,99,235,0.08)';
      ctx.strokeStyle = PRIMARY;
      ctx.lineWidth = 1;
      ctx.fillRect(sx(m.x), sy(m.y), m.width * t.scale, m.height * t.scale);
      ctx.strokeRect(
        Math.round(sx(m.x)) + 0.5,
        Math.round(sy(m.y)) + 0.5,
        m.width * t.scale,
        m.height * t.scale,
      );
    }
    if (overlay.guides.length) {
      ctx.strokeStyle = GUIDE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const g of overlay.guides) {
        if (g.axis === 'x') {
          const x = Math.round(sx(g.position)) + 0.5;
          ctx.moveTo(x, sy(g.from) - 8);
          ctx.lineTo(x, sy(g.to) + 8);
        } else {
          const y = Math.round(sy(g.position)) + 0.5;
          ctx.moveTo(sx(g.from) - 8, y);
          ctx.lineTo(sx(g.to) + 8, y);
        }
      }
      ctx.stroke();
    }
    if (overlay.draftLabel && mouse) {
      this.flip = false;
      this.pill(
        ctx,
        overlay.draftLabel,
        mouse.x + 14,
        mouse.y + 26,
        11,
        '#FFFFFF',
        INK,
        undefined,
        'left',
      );
    }
  }

  // ---------------------------------------------------------------- primitives

  /**
   * Rotates the drawing frame so x runs along the object's long axis.
   * Returns [length, cross] in that frame.
   */
  private alongLongAxis(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    vertical: boolean,
    rotation: number,
  ): [number, number] {
    if (!vertical) return [w, h];
    ctx.rotate(Math.PI / 2);
    ctx.translate(0, -w);
    const rot = normalizeAngle(rotation + 90);
    this.flip = rot > 90 && rot <= 270;
    return [h, w];
  }

  private polygon(ctx: CanvasRenderingContext2D, pts: number[][]): void {
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  /** Diagonal hatching clipped to a w × h rectangle at the origin. */
  private hatch(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    gap = 10,
    lineWidth = 1,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([]);
    ctx.beginPath();
    const count = Math.min(600, Math.ceil((w + h) / gap));
    for (let i = 0; i <= count; i++) {
      const x = i * gap;
      ctx.moveTo(x, 0);
      ctx.lineTo(x - h, h);
    }
    ctx.stroke();
    ctx.restore();
  }

  private text(
    ctx: CanvasRenderingContext2D,
    value: string,
    x: number,
    y: number,
    px: number,
    color: string,
    opts: TextOptions = {},
  ): void {
    if (!value || px < 6.5) return;
    ctx.font = `${opts.weight ?? 500} ${px}px ${FONT}`;
    let str = value;
    if (opts.maxWidth !== undefined) {
      if (opts.maxWidth < px * 1.6) return;
      if (ctx.measureText(str).width > opts.maxWidth) {
        while (str.length > 1 && ctx.measureText(str + '…').width > opts.maxWidth)
          str = str.slice(0, -1);
        if (str.length <= 1) return;
        str += '…';
      }
    }
    ctx.fillStyle = color;
    ctx.textAlign = opts.align ?? 'center';
    ctx.textBaseline = 'middle';
    if (this.flip) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI);
      ctx.fillText(str, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(str, x, y);
    }
  }

  /** Text on a rounded background. */
  private pill(
    ctx: CanvasRenderingContext2D,
    value: string,
    x: number,
    y: number,
    px: number,
    color: string,
    background: string,
    maxWidth?: number,
    align: 'center' | 'left' = 'center',
  ): void {
    if (!value || px < 6.5) return;
    ctx.font = `600 ${px}px ${FONT}`;
    const width = ctx.measureText(value).width + px * 1.1;
    if (maxWidth !== undefined && width > maxWidth) {
      this.text(ctx, value, x, y, px, color, { weight: 600, maxWidth });
      return;
    }
    const height = px * 1.7;
    const left = align === 'center' ? x - width / 2 : x;
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(left, y - height / 2, width, height, height / 2);
    ctx.fill();
    this.text(ctx, value, left + width / 2, y + 0.5, px, color, { weight: 600 });
  }
}
