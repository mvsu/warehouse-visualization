import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CanvasViewportService } from '../../../../core/services/canvas-viewport.service';
import { CoordinateService } from '../../../../core/services/coordinate.service';
import { ToolbarButtonComponent } from '../../../../shared/components/toolbar-button/toolbar-button.component';
import { ToolService } from '../../services/tool.service';

/**
 * Pointer read-out for the canvas: an X/Y crosshair that follows the pointer and a status bar with
 * the current world coordinates, configured cell dimensions and grid / snapping toggles.
 */
@Component({
  standalone: true,
  selector: 'app-coordinate-indicator',
  imports: [ToolbarButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (crosshair(); as c) {
      <div class="line vertical" [style.transform]="'translateX(' + c.x + 'px)'"></div>
      <div class="line horizontal" [style.transform]="'translateY(' + c.y + 'px)'"></div>
    }
    <div class="status surface">
      <span class="coords" aria-live="off">
        <span class="axis">X</span><span class="value">{{ position().x }}</span>
        <span class="axis">Y</span><span class="value">{{ position().y }}</span>
      </span>
      <span class="divider-v"></span>
      <span class="grid-step" data-tip="Configured warehouse grid cell" data-tip-pos="top"
        >Grid {{ gridSize() }}</span
      >
      <span class="divider-v"></span>
      <app-toolbar-button
        icon="grid"
        label="Show grid"
        [toggle]="true"
        [active]="tools.showGrid()"
        tipPosition="top"
        [size]="16"
        (pressed)="tools.setGridVisible(!tools.showGrid())"
      />
      <app-toolbar-button
        icon="magnet"
        label="Snap to grid"
        [toggle]="true"
        [active]="tools.snapToGrid()"
        tipPosition="top"
        [size]="16"
        (pressed)="tools.setSnapToGrid(!tools.snapToGrid())"
      />
      <app-toolbar-button
        icon="focus"
        label="Snap to objects"
        [toggle]="true"
        [active]="tools.snapToObjects()"
        tipPosition="top"
        [size]="16"
        (pressed)="tools.snapToObjects.set(!tools.snapToObjects())"
      />
      <app-toolbar-button
        icon="crosshair"
        label="Show crosshair"
        [toggle]="true"
        [active]="tools.showCrosshair()"
        tipPosition="top"
        [size]="16"
        (pressed)="tools.showCrosshair.set(!tools.showCrosshair())"
      />
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }
    .line {
      position: absolute;
      top: 0;
      left: 0;
      background: rgba(37, 99, 235, 0.35);
    }
    .vertical {
      width: 1px;
      height: 100%;
    }
    .horizontal {
      width: 100%;
      height: 1px;
    }
    .status {
      position: absolute;
      left: 12px;
      bottom: 12px;
      display: flex;
      align-items: center;
      gap: 2px;
      height: 38px;
      padding: 0 4px 0 12px;
      pointer-events: auto;
      overflow: visible;
    }
    .coords {
      display: flex;
      align-items: baseline;
      gap: 5px;
      font-variant-numeric: tabular-nums;
    }
    .axis {
      color: var(--text-2);
      font-size: 11px;
      font-weight: 600;
    }
    .value {
      min-width: 52px;
      font-weight: 500;
    }
    .grid-step {
      padding: 0 6px;
      color: var(--text-2);
      font-size: 12px;
      white-space: nowrap;
    }
  `,
})
export class CoordinateIndicatorComponent {
  protected readonly tools = inject(ToolService);
  private readonly viewport = inject(CanvasViewportService);
  private readonly coords = inject(CoordinateService);

  protected readonly crosshair = computed(() => {
    const m = this.viewport.mouseScreen();
    return m && this.tools.showCrosshair() ? { x: Math.round(m.x), y: Math.round(m.y) } : null;
  });

  protected readonly position = computed(() => {
    const w = this.viewport.mouseWorld();
    if (!w) return { x: '—', y: '—' };
    // Below one unit per pixel, show a decimal so the read-out keeps up with the pointer.
    const digits = this.viewport.scale() > 4 ? 1 : 0;
    const format = (v: number) =>
      v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return { x: format(w.x), y: format(w.y) };
  });

  protected readonly gridSize = computed(
    () =>
      `${this.coords.format(this.tools.gridCellWidth())} × ${this.coords.format(this.tools.gridCellHeight())} px`,
  );
}
