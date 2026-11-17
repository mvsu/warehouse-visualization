import { Dialog } from '@angular/cdk/dialog';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CanvasViewportService } from '../../../core/services/canvas-viewport.service';
import { RenderOverlay } from '../../../core/services/canvas-renderer.service';
import { CoordinateService } from '../../../core/services/coordinate.service';
import { Point } from '../../../core/utils/geometry';
import {
  RackDialogComponent,
} from '../components/rack-dialog/rack-dialog.component';
import { OBJECT_DEFS } from '../models/object-schema';
import { RackConfig } from '../models/rack.model';
import { ObjectType } from '../models/warehouse-object.model';
import { AisleTool } from '../tools/aisle.tool';
import { PanTool } from '../tools/pan.tool';
import { RectPlacementTool } from '../tools/placement.tool';
import { RackTool } from '../tools/rack.tool';
import { SelectTool } from '../tools/select.tool';
import { CanvasTool, ToolId } from '../tools/tool.model';
import { ObjectSelectionService } from './object-selection.service';
import { RackService } from './rack.service';
import { Patch, WarehouseService } from './warehouse.service';

const EMPTY_OVERLAY: RenderOverlay = {
  marquee: null,
  guides: [],
  draft: null,
  draftLabel: null,
  anchor: null,
};

/**
 * Editor (as opposed to document) state: the active tool, creation settings, snapping options,
 * transient canvas overlays and which panels are open. Tools reach every service they need through it.
 */
@Injectable({ providedIn: 'root' })
export class ToolService {
  readonly store = inject(WarehouseService);
  readonly selection = inject(ObjectSelectionService);
  readonly viewport = inject(CanvasViewportService);
  readonly coords = inject(CoordinateService);
  readonly racks = inject(RackService);
  private readonly dialog = inject(Dialog);

  readonly activeToolId = signal<ToolId>('select');
  readonly overlay = signal<RenderOverlay>(EMPTY_OVERLAY);
  /** Cursor requested by the active tool for the current hover/drag state. */
  readonly cursor = signal<string | null>(null);
  readonly snapToGrid = computed(() => this.store.gridSettings().snap);
  readonly snapToObjects = signal(true);
  readonly showGrid = computed(() => this.store.gridSettings().visible);
  readonly showCrosshair = signal(true);
  readonly layersOpen = signal(false);
  readonly inspectorCollapsed = signal(false);

  /** Creation settings per object type, as edited in the creation panel. */
  readonly configs = signal<Partial<Record<ObjectType, Patch>>>({});

  readonly gridCellWidth = computed(() => this.store.gridSettings().cellWidth);
  readonly gridCellHeight = computed(() => this.store.gridSettings().cellHeight);
  readonly creationType = computed<ObjectType | null>(() => {
    const id = this.activeToolId();
    return id === 'select' || id === 'pan' ? null : id;
  });
  readonly activeTool = computed<CanvasTool>(
    () => this.tools.get(this.activeToolId()) ?? this.tools.get('select')!,
  );

  private readonly tools = new Map<ToolId, CanvasTool>();

  constructor() {
    this.tools.set('select', new SelectTool(this));
    this.tools.set('pan', new PanTool());
    this.tools.set('rack', new RackTool(this));
    this.tools.set('aisle', new AisleTool(this));
    for (const def of Object.values(OBJECT_DEFS)) {
      if (def.placement === 'rect' && !this.tools.has(def.type))
        this.tools.set(def.type, new RectPlacementTool(this, def.type));
    }

    // Leaving edit mode always returns to the Select tool.
    effect(() => {
      if (!this.store.editMode() && untracked(this.creationType))
        untracked(() => this.setTool('select'));
    });
  }

  setTool(id: ToolId): void {
    if (id === this.activeToolId()) return;
    this.activeTool().deactivate?.();
    this.clearOverlay();
    this.cursor.set(null);
    this.activeToolId.set(id);
    if (id !== 'select' && id !== 'pan') {
      this.store.editMode.set(true);
      this.selection.clear();
    }
  }

  /** Entry point for every "create X" button. Racks open their dialog first; other types go straight to placement. */
  startCreation(type: ObjectType, preset?: Patch): void {
    this.store.editMode.set(true);
    if (type === 'rack') {
      this.openRackDialog();
      return;
    }
    if (preset) this.patchConfig(type, preset);
    this.setTool(type);
  }

  openRackDialog(): void {
    const ref = this.dialog.open<RackConfig>(RackDialogComponent, {
      backdropClass: 'dialog-backdrop',
      panelClass: 'dialog-panel',
      autoFocus: 'first-tabbable',
      ariaLabel: 'Add rack',
    });
    ref.closed.subscribe((config) => {
      if (!config) return;
      this.configs.update((c) => ({ ...c, rack: this.racks.fromConfig(config) }));
      // Re-arm the tool even if it was already active so the new configuration is picked up.
      this.activeToolId.set('select');
      this.setTool('rack');
    });
  }

  /** Effective creation settings: type defaults overlaid with the user's edits. */
  config(type: ObjectType): Patch {
    const def = OBJECT_DEFS[type];
    return { width: def.size[0], height: def.size[1], ...def.defaults, ...this.configs()[type] };
  }

  patchConfig(type: ObjectType, patch: Patch): void {
    this.configs.update((c) => ({ ...c, [type]: { ...c[type], ...patch } }));
  }

  setGridVisible(visible: boolean): void {
    this.store.updateGridSettings({ ...this.store.gridSettings(), visible });
  }

  setSnapToGrid(snap: boolean): void {
    this.store.updateGridSettings({ ...this.store.gridSettings(), snap });
  }

  /** Grid snapping for a world point. The persisted grid setting is the sole authority. */
  snapWorld(p: Point, _disabled = false): Point {
    if (!this.snapToGrid())
      return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
    return this.coords.snapPoint(p, this.gridCellWidth(), this.gridCellHeight());
  }

  gridAlignedSize(width: number, height: number): { width: number; height: number } {
    if (!this.snapToGrid()) return { width, height };
    return {
      width: Math.max(
        this.gridCellWidth(),
        Math.ceil(width / this.gridCellWidth()) * this.gridCellWidth(),
      ),
      height: Math.max(
        this.gridCellHeight(),
        Math.ceil(height / this.gridCellHeight()) * this.gridCellHeight(),
      ),
    };
  }

  patchOverlay(patch: Partial<RenderOverlay>): void {
    this.overlay.update((o) => ({ ...o, ...patch }));
  }

  clearOverlay(): void {
    if (this.overlay() !== EMPTY_OVERLAY) this.overlay.set(EMPTY_OVERLAY);
  }

  /** Called by placement tools once their object exists: select it and hand control back to Select. */
  finishPlacement(ids: string[]): void {
    this.setTool('select');
    this.selection.set(ids);
    this.inspectorCollapsed.set(false);
  }

  /** Escape: let the tool cancel its gesture, then fall back to Select, then clear the selection. */
  cancel(): void {
    if (this.activeTool().cancel?.()) return;
    if (this.activeToolId() !== 'select') this.setTool('select');
    else this.selection.clear();
  }
}
