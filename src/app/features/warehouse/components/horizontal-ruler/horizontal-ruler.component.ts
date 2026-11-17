import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CanvasViewportService } from '../../../../core/services/canvas-viewport.service';
import { CoordinateService } from '../../../../core/services/coordinate.service';
import { paintRuler } from '../../../../core/utils/ruler';
import { WarehouseService } from '../../services/warehouse.service';

export const RULER_THICKNESS = 24;

/** X-axis ruler, fixed above the canvas and driven by the shared viewport transform. */
@Component({
  standalone: true,
  selector: 'app-horizontal-ruler',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: `
    :host {
      display: block;
      overflow: hidden;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class HorizontalRulerComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly viewport = inject(CanvasViewportService);
  private readonly coords = inject(CoordinateService);
  private readonly store = inject(WarehouseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly length = signal(0);

  constructor() {
    afterNextRender(() => {
      const observer = new ResizeObserver(() =>
        this.length.set(this.host.nativeElement.clientWidth),
      );
      observer.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });

    effect(() => {
      const length = this.length();
      if (!length) return;
      const canvas = this.canvasRef().nativeElement;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(length * dpr);
      canvas.height = Math.round(RULER_THICKNESS * dpr);
      const scale = this.viewport.scale();
      const steps = this.coords.rulerSteps(scale, this.store.gridSettings().cellWidth);
      const selection = this.store.selectionBounds();
      paintRuler(canvas.getContext('2d')!, {
        axis: 'x',
        length,
        thickness: RULER_THICKNESS,
        dpr,
        scale,
        offset: this.viewport.offsetX(),
        major: steps.major,
        minor: steps.minor,
        worldMax: this.viewport.worldWidth(),
        mouse: this.viewport.mouseScreen()?.x ?? null,
        highlight: selection ? [selection.x, selection.x + selection.width] : null,
      });
    });
  }
}
