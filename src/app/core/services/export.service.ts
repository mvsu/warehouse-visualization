import { Injectable, inject } from '@angular/core';
import { Rack } from '../../features/warehouse/models/rack.model';
import { WarehouseObject } from '../../features/warehouse/models/warehouse-object.model';
import { Bounds, boxAabb, round, unionBounds } from '../utils/geometry';
import { CanvasRendererService } from './canvas-renderer.service';

const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
const prop = (o: WarehouseObject, key: string) => (o as unknown as Record<string, unknown>)[key];

/** Turns the current layout into downloadable files. Everything runs in the browser. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly renderer = inject(CanvasRendererService);

  download(content: Blob | string, filename: string, type = 'application/octet-stream'): void {
    const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  filename(name: string, extension: string): string {
    const base =
      name
        .trim()
        .replace(/[^\w\- ]+/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase() || 'warehouse';
    return `${base}.${extension}`;
  }

  /** Renders all objects onto an off-screen canvas, scaled so the longest side is at most `maxSize` pixels. */
  async renderToCanvas(
    objects: WarehouseObject[],
    maxSize = 4096,
  ): Promise<HTMLCanvasElement | null> {
    const bounds = this.bounds(objects);
    if (!bounds) return null;
    await this.renderer.preloadImages(objects);
    const scale = Math.min(4, maxSize / Math.max(bounds.width, bounds.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(bounds.width * scale);
    canvas.height = Math.ceil(bounds.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const transform = { scale, offsetX: -bounds.x * scale, offsetY: -bounds.y * scale };
    this.renderer.drawObjects(ctx, objects, transform, {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    });
    return canvas;
  }

  async toPng(objects: WarehouseObject[]): Promise<Blob | null> {
    const canvas = await this.renderToCanvas(objects);
    if (!canvas) return null;
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  /** Single-page PDF (A4, orientation follows the layout) with the drawing embedded as an image. */
  async toPdf(objects: WarehouseObject[]): Promise<Blob | null> {
    const canvas = await this.renderToCanvas(objects, 3200);
    if (!canvas) return null;
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92),
    );
    if (!jpeg) return null;
    return this.buildPdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height);
  }

  /** Vector export: each object becomes a group with its real coordinates in world units. */
  toSvg(objects: WarehouseObject[]): string | null {
    const b = this.bounds(objects);
    if (!b) return null;
    const body = objects.map((o) => this.svgObject(o)).join('\n');
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(b.x)} ${round(b.y)} ${round(b.width)} ${round(b.height)}" ` +
      `width="${round(b.width)}" height="${round(b.height)}" font-family="Inter, Arial, sans-serif">\n` +
      `<rect x="${round(b.x)}" y="${round(b.y)}" width="${round(b.width)}" height="${round(b.height)}" fill="#FFFFFF"/>\n${body}\n</svg>\n`
    );
  }

  /** Reads an image or SVG file as a data URL together with its natural size. */
  readImage(file: File): Promise<{ src: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The file could not be read.'));
      reader.onload = () => {
        const src = String(reader.result);
        const img = new Image();
        img.onload = () =>
          resolve({ src, width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
        img.onerror = () => reject(new Error('The file is not an image the browser can display.'));
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
  }

  private bounds(objects: WarehouseObject[]): Bounds | null {
    const b = unionBounds(objects.map((o) => boxAabb(o)));
    if (!b) return null;
    const pad = Math.max(20, Math.max(b.width, b.height) * 0.03);
    return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
  }

  private svgObject(o: WarehouseObject): string {
    const w = round(o.width);
    const h = round(o.height);
    const cx = round(o.x + o.width / 2);
    const cy = round(o.y + o.height / 2);
    const open = `<g id="${esc(o.id)}" data-type="${o.type}" transform="translate(${cx} ${cy}) rotate(${round(o.rotation)}) translate(${-w / 2} ${-h / 2})">`;
    const color = String(prop(o, 'color') ?? '#64748B');
    const label = (text: string, size: number, fill = '#0F172A') =>
      `<text x="${w / 2}" y="${h / 2}" font-size="${round(size)}" fill="${fill}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`;
    const fit = (text: string) =>
      Math.max(2, Math.min(h * 0.4, (w / Math.max(4, text.length)) * 1.4, 14));
    let inner = '';
    switch (o.type) {
      case 'rack': {
        const r = o as Rack;
        const cw = r.cellWidth;
        const ch = r.cellHeight;
        const fills: Record<string, string> = { Occupied: '0.4', Reserved: '0.25', Blocked: '0.6' };
        inner = `<rect width="${w}" height="${h}" fill="#FFFFFF"/>`;
        if (r.cells.length <= 4000) {
          for (const c of r.cells) {
            const x = round((c.column - 1) * (cw + r.columnSpacing), 3);
            const y = round((c.row - 1) * (ch + r.rowSpacing), 3);
            inner += `<rect id="${esc(c.id)}" x="${x}" y="${y}" width="${round(cw, 3)}" height="${round(ch, 3)}" fill="${esc(color)}" fill-opacity="${fills[c.status ?? ''] ?? '0.07'}" stroke="${esc(color)}" stroke-opacity="0.5" stroke-width="0.5"/>`;
          }
        }
        inner += `<rect width="${w}" height="${h}" fill="none" stroke="${esc(color)}" stroke-width="1"/>`;
        inner += `<text x="0" y="-4" font-size="7" fill="#475569">${esc(r.label || r.name)}</text>`;
        break;
      }
      case 'space':
        inner =
          `<rect width="${w}" height="${h}" rx="${round(Number(prop(o, 'cornerRadius')) || 0)}" fill="${esc(prop(o, 'fillColor'))}" fill-opacity="${esc(prop(o, 'opacity'))}" stroke="${esc(prop(o, 'borderColor'))}" stroke-width="1"/>` +
          (prop(o, 'labelVisible') ? label(o.name, fit(o.name)) : '');
        break;
      case 'aisle':
        inner = `<rect width="${w}" height="${h}" fill="${esc(color)}" fill-opacity="0.32" stroke="${esc(color)}" stroke-dasharray="6 4" stroke-width="0.75"/>${label(o.name, fit(o.name), '#713F12')}`;
        break;
      case 'text':
        inner = `<text x="0" y="${h / 2}" font-size="${esc(prop(o, 'fontSize'))}" font-weight="${prop(o, 'bold') ? 700 : 400}" fill="${esc(color)}" dominant-baseline="central">${esc(o.name)}</text>`;
        break;
      case 'shape': {
        const attrs = `fill="${esc(prop(o, 'fillColor'))}" fill-opacity="${esc(prop(o, 'opacity'))}" stroke="${esc(prop(o, 'borderColor'))}" stroke-width="${esc(prop(o, 'borderWidth'))}"`;
        const poly = (pts: number[][]) =>
          `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" ${attrs}/>`;
        const kind = prop(o, 'shapeKind');
        if (kind === 'Ellipse' || kind === 'Circle')
          inner = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`;
        else if (kind === 'Triangle')
          inner = poly([
            [w / 2, 0],
            [w, h],
            [0, h],
          ]);
        else
          inner = `<rect width="${w}" height="${h}" ${attrs}/>`;
        break;
      }
      case 'image':
        inner = `<image width="${w}" height="${h}" href="${esc(prop(o, 'src'))}" opacity="${esc(prop(o, 'opacity'))}" preserveAspectRatio="none"/>`;
        break;
      default:
        inner = `<rect width="${w}" height="${h}" fill="${esc(color)}" fill-opacity="0.1" stroke="${esc(color)}" stroke-width="1"/>${label(o.name, fit(o.name))}`;
    }
    return `${open}<title>${esc(o.name)}</title>${inner}</g>`;
  }

  /** Minimal PDF writer: one page containing one JPEG (DCTDecode) image. */
  private buildPdf(jpeg: Uint8Array, imageWidth: number, imageHeight: number): Blob {
    const landscape = imageWidth >= imageHeight;
    const pageW = landscape ? 841.89 : 595.28;
    const pageH = landscape ? 595.28 : 841.89;
    const margin = 28;
    const scale = Math.min((pageW - margin * 2) / imageWidth, (pageH - margin * 2) / imageHeight);
    const w = imageWidth * scale;
    const h = imageHeight * scale;
    const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${((pageW - w) / 2).toFixed(2)} ${((pageH - h) / 2).toFixed(2)} cm /Im0 Do Q`;

    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const offsets: number[] = [];
    let length = 0;
    const push = (chunk: string | Uint8Array) => {
      const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
      parts.push(bytes);
      length += bytes.length;
    };
    const object = (id: number, body: string, stream?: Uint8Array) => {
      offsets[id] = length;
      push(`${id} 0 obj\n${body}\n`);
      if (stream) {
        push('stream\n');
        push(stream);
        push('\nendstream\n');
      }
      push('endobj\n');
    };

    push('%PDF-1.4\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    );
    object(
      4,
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
      jpeg,
    );
    const contentBytes = encoder.encode(content);
    object(5, `<< /Length ${contentBytes.length} >>`, contentBytes);
    const xref = length;
    push(`xref\n0 6\n0000000000 65535 f \n`);
    for (let id = 1; id <= 5; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts as BlobPart[], { type: 'application/pdf' });
  }
}
