import { Injectable, computed, signal } from '@angular/core';
import {
  DEFAULT_WAREHOUSE_HEIGHT,
  DEFAULT_WAREHOUSE_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../features/warehouse/models/warehouse.model';
import { Bounds, Point, ViewTransform, clamp } from '../utils/geometry';

/** Logical pixels remain unscaled in storage; the viewport fit determines their screen size. */
export const BASE_PIXELS_PER_UNIT = 1;
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 5;

const ZOOM_STOPS = [0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5];

/**
 * Single source of truth for the canvas camera.
 * The canvas, both rulers, the grid, hit-testing and every tool convert coordinates through this service,
 * so they can never drift apart.   screen = world * scale + offset
 */
@Injectable({ providedIn: 'root' })
export class CanvasViewportService {
  readonly worldWidth = signal(WORLD_WIDTH);
  readonly worldHeight = signal(WORLD_HEIGHT);

  /** 1 = 100%. */
  readonly zoomScale = signal(1);
  /** Screen position of the world origin. */
  readonly offsetX = signal(0);
  readonly offsetY = signal(0);
  readonly viewportWidth = signal(0);
  readonly viewportHeight = signal(0);
  /** Pointer position relative to the canvas, or null when the pointer is elsewhere. */
  readonly mouseScreen = signal<Point | null>(null);

  /** Screen scale that fits the complete default 2,000 × 2,000 px area in the viewport. */
  readonly fitScale = computed(() => {
    const width = this.viewportWidth();
    const height = this.viewportHeight();
    if (!width || !height) return BASE_PIXELS_PER_UNIT;
    return (
      Math.min(width / DEFAULT_WAREHOUSE_WIDTH, height / DEFAULT_WAREHOUSE_HEIGHT) *
      BASE_PIXELS_PER_UNIT
    );
  });
  /**
   * Lowest zoom: the point where the canvas (at most 24,400 × 20,000 px) spans the full viewport
   * width. Zooming out stops there, so no empty margin appears beside the canvas.
   */
  readonly minZoom = computed(() => {
    const width = this.viewportWidth();
    const height = this.viewportHeight();
    if (!width || !height) return MIN_ZOOM;
    return clamp(width / this.worldWidth() / this.fitScale(), MIN_ZOOM, MAX_ZOOM);
  });
  /** Screen pixels per world unit at the current viewport-relative zoom. */
  readonly scale = computed(() => this.zoomScale() * this.fitScale());
  readonly transform = computed<ViewTransform>(() => ({
    scale: this.scale(),
    offsetX: this.offsetX(),
    offsetY: this.offsetY(),
  }));
  readonly zoomPercent = computed(() => Math.round(this.zoomScale() * 100));
  readonly mouseWorld = computed<Point | null>(() => {
    const m = this.mouseScreen();
    return m ? this.screenToWorld(m.x, m.y) : null;
  });

  private animation = 0;

  setViewportSize(width: number, height: number): void {
    const previousScale = this.scale();
    const worldX = previousScale ? -this.offsetX() / previousScale : 0;
    const worldY = previousScale ? -this.offsetY() / previousScale : 0;
    this.viewportWidth.set(width);
    this.viewportHeight.set(height);
    this.zoomScale.update((zoom) => Math.max(zoom, this.minZoom()));
    this.setOffset(-worldX * this.scale(), -worldY * this.scale());
  }

  setWorldSize(width: number, height: number): void {
    this.worldWidth.set(clamp(width, DEFAULT_WAREHOUSE_WIDTH, WORLD_WIDTH));
    this.worldHeight.set(clamp(height, DEFAULT_WAREHOUSE_HEIGHT, WORLD_HEIGHT));
    this.zoomScale.update((zoom) => Math.max(zoom, this.minZoom()));
    this.setOffset(this.offsetX(), this.offsetY());
  }

  worldToScreen(x: number, y: number): Point {
    const s = this.scale();
    return { x: x * s + this.offsetX(), y: y * s + this.offsetY() };
  }

  screenToWorld(x: number, y: number): Point {
    const s = this.scale();
    return { x: (x - this.offsetX()) / s, y: (y - this.offsetY()) / s };
  }

  /** Changes the zoom while keeping the world point under (screenX, screenY) fixed on screen. */
  zoomAtPoint(screenX: number, screenY: number, newZoom: number): void {
    this.cancelAnimation();
    this.applyZoomAt(screenX, screenY, newZoom);
  }

  panCanvas(deltaX: number, deltaY: number): void {
    this.cancelAnimation();
    this.setOffset(this.offsetX() + deltaX, this.offsetY() + deltaY);
  }

  /** Moves the camera to native scrollbar coordinates. */
  scrollTo(scrollLeft: number, scrollTop: number): void {
    this.cancelAnimation();
    this.setOffset(-scrollLeft, -scrollTop);
  }

  getVisibleWorldBounds(): Bounds {
    const a = this.screenToWorld(0, 0);
    const b = this.screenToWorld(this.viewportWidth(), this.viewportHeight());
    const x = clamp(a.x, 0, this.worldWidth());
    const y = clamp(a.y, 0, this.worldHeight());
    return {
      x,
      y,
      width: clamp(b.x, 0, this.worldWidth()) - x,
      height: clamp(b.y, 0, this.worldHeight()) - y,
    };
  }

  getWorldMousePosition(): Point | null {
    return this.mouseWorld();
  }

  /** Frames the given bounds (selection or all content). Without bounds it returns to the origin at 100%. */
  fitToScreen(bounds?: Bounds | null): void {
    if (bounds) this.fitBounds(bounds, 96);
    else this.animateTo(1, 0, 0);
  }

  /** Frames the entire warehouse footprint with a small margin. */
  fitToWarehouse(bounds?: Bounds | null): void {
    if (bounds) this.fitBounds(bounds, 56);
    else this.animateTo(1, 0, 0);
  }

  fitBounds(bounds: Bounds, padding = 72, animate = true): void {
    const vw = this.viewportWidth();
    const vh = this.viewportHeight();
    if (!vw || !vh) return;
    const pad = Math.min(padding, vw / 4, vh / 4);
    const w = Math.max(bounds.width, 1);
    const h = Math.max(bounds.height, 1);
    const desiredScale = Math.min((vw - pad * 2) / w, (vh - pad * 2) / h);
    const zoom = clamp(desiredScale / this.fitScale(), this.minZoom(), MAX_ZOOM);
    const s = zoom * this.fitScale();
    const ox = vw / 2 - (bounds.x + bounds.width / 2) * s;
    const oy = vh / 2 - (bounds.y + bounds.height / 2) * s;
    if (animate) this.animateTo(zoom, ox, oy);
    else this.setView(zoom, ox, oy);
  }

  zoomIn(): void {
    const z = this.zoomScale();
    this.zoomCentered(ZOOM_STOPS.find((stop) => stop > z + 1e-6) ?? MAX_ZOOM);
  }

  zoomOut(): void {
    const z = this.zoomScale();
    this.zoomCentered([...ZOOM_STOPS].reverse().find((stop) => stop < z - 1e-6) ?? this.minZoom());
  }

  zoomCentered(zoom: number): void {
    const cx = this.viewportWidth() / 2;
    const cy = this.viewportHeight() / 2;
    const world = this.screenToWorld(cx, cy);
    const z = clamp(zoom, this.minZoom(), MAX_ZOOM);
    const s = z * this.fitScale();
    this.animateTo(z, cx - world.x * s, cy - world.y * s);
  }

  setView(zoom: number, offsetX: number, offsetY: number): void {
    this.cancelAnimation();
    this.zoomScale.set(clamp(zoom, this.minZoom(), MAX_ZOOM));
    this.setOffset(offsetX, offsetY);
  }

  private applyZoomAt(screenX: number, screenY: number, newZoom: number): void {
    const zoom = clamp(newZoom, this.minZoom(), MAX_ZOOM);
    const world = this.screenToWorld(screenX, screenY);
    this.zoomScale.set(zoom);
    const s = zoom * this.fitScale();
    this.setOffset(screenX - world.x * s, screenY - world.y * s);
  }

  private setOffset(x: number, y: number): void {
    const s = this.scale();
    this.offsetX.set(this.clampOffset(x, this.viewportWidth(), this.worldWidth() * s));
    this.offsetY.set(this.clampOffset(y, this.viewportHeight(), this.worldHeight() * s));
  }

  /** Keeps the viewport inside the warehouse so no decorative grey margin is exposed. */
  private clampOffset(value: number, viewport: number, worldPixels: number): number {
    const min = Math.min(0, viewport - worldPixels);
    const max = 0;
    return min > max ? (min + max) / 2 : clamp(value, min, max);
  }

  private animateTo(zoom: number, offsetX: number, offsetY: number): void {
    this.cancelAnimation();
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof requestAnimationFrame !== 'function') {
      this.setView(zoom, offsetX, offsetY);
      return;
    }
    const from = { z: this.zoomScale(), x: this.offsetX(), y: this.offsetY() };
    const start = performance.now();
    const duration = 200;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - (1 - p) ** 3;
      // Interpolate zoom geometrically so the motion feels uniform.
      this.zoomScale.set(from.z * (zoom / from.z) ** e);
      this.offsetX.set(from.x + (offsetX - from.x) * e);
      this.offsetY.set(from.y + (offsetY - from.y) * e);
      if (p < 1) this.animation = requestAnimationFrame(step);
      else {
        this.animation = 0;
        this.zoomScale.set(clamp(zoom, this.minZoom(), MAX_ZOOM));
        this.setOffset(offsetX, offsetY);
      }
    };
    this.animation = requestAnimationFrame(step);
  }

  private cancelAnimation(): void {
    if (this.animation) cancelAnimationFrame(this.animation);
    this.animation = 0;
  }
}
