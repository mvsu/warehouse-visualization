import { ChangeDetectionStrategy, Component, ElementRef, effect, input, viewChild } from '@angular/core';

export interface RackPreviewModel {
  rows: number;
  columns: number;
  width: number;
  height: number;
  rowSpacing: number;
  columnSpacing: number;
  color: string;
  cells?: { status?: string }[];
}

const WIDTH = 260;
const HEIGHT = 132;

/** Live miniature of a rack grid, used in the rack dialog and in the inspector. */
@Component({
  standalone: true,
  selector: 'app-rack-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas role="img" [attr.aria-label]="'Rack preview: ' + rack().rows + ' rows by ' + rack().columns + ' columns'"></canvas>`,
  styles: `
    :host {
      display: block;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background:
        linear-gradient(var(--grid) 1px, transparent 1px) 0 0 / 12px 12px,
        linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0 / 12px 12px,
        #fff;
    }
    canvas {
      display: block;
      width: 100%;
      aspect-ratio: 260 / 132;
    }
  `,
})
export class RackPreviewComponent {
  readonly rack = input.required<RackPreviewModel>();
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    effect(() => this.draw(this.rack()));
  }

  private draw(r: RackPreviewModel): void {
    const canvas = this.canvasRef().nativeElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const rows = Math.max(1, Math.round(r.rows) || 1);
    const cols = Math.max(1, Math.round(r.columns) || 1);
    const rw = Math.max(1, r.width || 1);
    const rh = Math.max(1, r.height || 1);
    const scale = Math.min((WIDTH - 28) / rw, (HEIGHT - 28) / rh);
    const w = rw * scale;
    const h = rh * scale;
    const x0 = (WIDTH - w) / 2;
    const y0 = (HEIGHT - h) / 2;
    const gapX = Math.max(0, r.columnSpacing || 0) * scale;
    const gapY = Math.max(0, r.rowSpacing || 0) * scale;
    const cw = (w - gapX * (cols - 1)) / cols;
    const ch = (h - gapY * (rows - 1)) / rows;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x0, y0, w, h);
    if (cw < 2 || ch < 2) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = r.color;
      ctx.fillRect(x0, y0, w, h);
      ctx.globalAlpha = 1;
    } else {
      ctx.beginPath();
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = x0 + col * (cw + gapX);
          const y = y0 + row * (ch + gapY);
          const status = r.cells?.[row * cols + col]?.status;
          ctx.globalAlpha = status === 'Occupied' ? 0.4 : status === 'Reserved' ? 0.25 : status === 'Blocked' ? 0.6 : 0.08;
          ctx.fillStyle = status === 'Reserved' ? '#F59E0B' : status === 'Blocked' ? '#64748B' : r.color;
          ctx.fillRect(x, y, cw, ch);
          ctx.rect(x, y, cw, ch);
        }
      }
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, w, h);
  }
}
