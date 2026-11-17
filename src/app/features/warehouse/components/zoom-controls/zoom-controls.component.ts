import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CanvasViewportService, MAX_ZOOM } from '../../../../core/services/canvas-viewport.service';
import { ToolbarButtonComponent } from '../../../../shared/components/toolbar-button/toolbar-button.component';
import { WarehouseService } from '../../services/warehouse.service';

@Component({
  standalone: true,
  selector: 'app-zoom-controls',
  imports: [ToolbarButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zoom surface" role="toolbar" aria-label="Zoom and navigation">
      <app-toolbar-button icon="minus" label="Zoom out" shortcut="−" tipPosition="top" [disabled]="viewport.zoomScale() <= viewport.minZoom() + 0.0001" (pressed)="viewport.zoomOut()" />
      <button type="button" class="percent" data-tip="Reset to 100%" data-tip-pos="top" (click)="viewport.zoomCentered(1)">{{ viewport.zoomPercent() }}%</button>
      <app-toolbar-button icon="plus" label="Zoom in" shortcut="+" tipPosition="top" [disabled]="viewport.zoomScale() >= max" (pressed)="viewport.zoomIn()" />
      <span class="divider-v"></span>
      <app-toolbar-button icon="fit-screen" label="Fit to screen (selection, or everything)" shortcut="Shift 1" tipPosition="top-end" (pressed)="fitScreen()" />
      <app-toolbar-button icon="fit-warehouse" label="Fit to warehouse" shortcut="Shift 2" tipPosition="top-end" (pressed)="fitWarehouse()" />
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      right: 12px;
      bottom: 12px;
    }
    .zoom {
      display: flex;
      align-items: center;
      gap: 2px;
      height: 38px;
      padding: 0 4px;
    }
    .percent {
      min-width: 54px;
      height: 30px;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .percent:hover {
      background: var(--hover);
    }
  `,
})
export class ZoomControlsComponent {
  protected readonly viewport = inject(CanvasViewportService);
  private readonly store = inject(WarehouseService);
  protected readonly max = MAX_ZOOM;

  protected fitScreen(): void {
    this.viewport.fitToScreen(this.store.selectionBounds() ?? this.store.contentBounds());
  }

  protected fitWarehouse(): void {
    this.viewport.fitToWarehouse(this.store.contentBounds());
  }
}
