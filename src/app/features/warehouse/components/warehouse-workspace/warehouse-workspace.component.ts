import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CanvasViewportService } from '../../../../core/services/canvas-viewport.service';
import { ToastService } from '../../../../core/services/toast.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ObjectType } from '../../models/warehouse-object.model';
import { EditorActionsService } from '../../services/editor-actions.service';
import { ToolService } from '../../services/tool.service';
import { WarehouseService } from '../../services/warehouse.service';
import { CoordinateIndicatorComponent } from '../coordinate-indicator/coordinate-indicator.component';
import { HorizontalRulerComponent } from '../horizontal-ruler/horizontal-ruler.component';
import { LayerPanelComponent } from '../layer-panel/layer-panel.component';
import { PropertiesPanelComponent } from '../properties-panel/properties-panel.component';
import { VerticalRulerComponent } from '../vertical-ruler/vertical-ruler.component';
import { ViewFiltersComponent } from '../view-filters/view-filters.component';
import { ViewPanelComponent } from '../view-panel/view-panel.component';
import { WarehouseCanvasComponent } from '../warehouse-canvas/warehouse-canvas.component';
import { WarehouseToolbarComponent } from '../warehouse-toolbar/warehouse-toolbar.component';
import { WarehouseTopbarComponent } from '../warehouse-topbar/warehouse-topbar.component';
import { ZoomControlsComponent } from '../zoom-controls/zoom-controls.component';

/** Single-key shortcuts that start a creation tool. */
const CREATE_KEYS: Record<string, ObjectType> = {
  r: 'rack',
  a: 'aisle',
  t: 'text',
  p: 'shape',
};

/** Application shell: lays out the five work areas and owns global keyboard shortcuts. */
@Component({
  standalone: true,
  selector: 'app-warehouse-workspace',
  imports: [
    WarehouseTopbarComponent,
    WarehouseToolbarComponent,
    WarehouseCanvasComponent,
    HorizontalRulerComponent,
    VerticalRulerComponent,
    CoordinateIndicatorComponent,
    ZoomControlsComponent,
    PropertiesPanelComponent,
    LayerPanelComponent,
    ViewFiltersComponent,
    ViewPanelComponent,
    IconComponent,
    CdkContextMenuTrigger,
    CdkMenu,
    CdkMenuItem,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './warehouse-workspace.component.html',
  styleUrl: './warehouse-workspace.component.scss',
  host: {
    '(document:keydown)': 'onKeyDown($event)',
  },
})
export class WarehouseWorkspaceComponent {
  protected readonly store = inject(WarehouseService);
  protected readonly tools = inject(ToolService);
  protected readonly actions = inject(EditorActionsService);
  protected readonly toasts = inject(ToastService).toasts;
  private readonly viewport = inject(CanvasViewportService);

  constructor() {
    void this.store.init();
  }

  protected onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const typing =
      !!target &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // Save works everywhere, including while typing in a field.
    if (mod && key === 's') {
      e.preventDefault();
      void this.actions.save();
      return;
    }
    // Never hijack keys while the user types or while a dialog / menu is open.
    if (typing) {
      if (key === 'escape') target?.blur();
      return;
    }
    if (document.querySelector('.cdk-dialog-container, .cdk-overlay-pane .menu')) return;

    if (mod) {
      const handled = this.onModifiedKey(key, e.shiftKey);
      if (handled) e.preventDefault();
      return;
    }
    if (e.altKey) return;

    if (e.shiftKey && e.code === 'Digit1') return this.actions.fitSelection();
    if (e.shiftKey && e.code === 'Digit2')
      return this.viewport.fitToWarehouse(this.store.contentBounds());

    switch (key) {
      case 'escape':
        this.tools.cancel();
        return;
      case 'delete':
      case 'backspace':
        e.preventDefault();
        this.actions.delete();
        return;
      case 'v':
        this.tools.setTool('select');
        return;
      case 'h':
        this.tools.setTool('pan');
        return;
      case 'l':
        this.tools.layersOpen.set(!this.tools.layersOpen());
        return;
      case '+':
      case '=':
        this.viewport.zoomIn();
        return;
      case '-':
      case '_':
        this.viewport.zoomOut();
        return;
      case ']':
        this.actions.bringToFront();
        return;
      case '[':
        this.actions.sendToBack();
        return;
      case 'arrowleft':
      case 'arrowright':
      case 'arrowup':
      case 'arrowdown': {
        if (!this.actions.canEdit()) return;
        e.preventDefault();
        const grid = this.store.gridSettings();
        const multiplier = e.shiftKey ? 10 : 1;
        const stepX = (grid.snap ? grid.cellWidth : 1) * multiplier;
        const stepY = (grid.snap ? grid.cellHeight : 1) * multiplier;
        this.actions.nudge(
          key === 'arrowleft' ? -stepX : key === 'arrowright' ? stepX : 0,
          key === 'arrowup' ? -stepY : key === 'arrowdown' ? stepY : 0,
        );
        return;
      }
    }
    const type = CREATE_KEYS[key];
    if (type && !e.shiftKey) this.tools.startCreation(type);
  }

  private onModifiedKey(key: string, shift: boolean): boolean {
    switch (key) {
      case 'c':
        this.actions.copy();
        return true;
      case 'v':
        this.actions.paste();
        return true;
      case 'd':
        this.actions.duplicate();
        return true;
      case 'z':
        if (shift) this.actions.redo();
        else this.actions.undo();
        return true;
      case 'y':
        this.actions.redo();
        return true;
      case 'g':
        if (shift) this.actions.ungroup();
        else this.actions.group();
        return true;
      case 'a':
        this.actions.selectAll();
        return true;
      case 'l':
        this.actions.toggleLock();
        return true;
      case '0':
        this.viewport.zoomCentered(1);
        return true;
      default:
        return false;
    }
  }
}
