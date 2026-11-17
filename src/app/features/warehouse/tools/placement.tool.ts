import { Bounds, Point, boundsFromPoints, distance, round } from '../../../core/utils/geometry';
import { ObjectType, WarehouseObject } from '../models/warehouse-object.model';
import type { ToolService } from '../services/tool.service';
import type { Patch } from '../services/warehouse.service';
import { CanvasTool, ToolPointerEvent } from './tool.model';

const DRAG_THRESHOLD = 5;

/**
 * Base tool for box-shaped objects.
 * A ghost of the configured object follows the pointer: click to place it at its configured size,
 * or drag to draw a custom footprint. After placing, the editor returns to the Select tool.
 */
export class RectPlacementTool implements CanvasTool {
  readonly cursor = 'crosshair';
  protected readonly allowDrag: boolean = true;

  private start: Point | null = null;
  private startScreen: Point = { x: 0, y: 0 };
  private template: WarehouseObject | null = null;
  private templateSource: unknown = undefined;
  private templateGridSource: unknown = undefined;

  constructor(
    protected readonly ctx: ToolService,
    readonly type: ObjectType,
  ) {}

  /** Property overrides taken from the creation panel. Subclasses translate creation-only values. */
  protected overrides(): Patch {
    return this.ctx.config(this.type);
  }

  /** Lets subclasses adapt properties to a dragged rectangle (e.g. aisle direction). */
  protected fit(rect: Bounds): Patch {
    return { ...rect, rotation: 0 };
  }

  onPointerDown(e: ToolPointerEvent): void {
    this.start = this.ctx.snapWorld(e.world, e.alt);
    this.startScreen = e.screen;
  }

  onPointerMove(e: ToolPointerEvent): void {
    const template = this.getTemplate();
    if (this.allowDrag && this.start && distance(e.screen, this.startScreen) >= DRAG_THRESHOLD) {
      const rect = this.dragRect(e);
      this.ctx.patchOverlay({
        draft: this.ctx.store.preview(this.type, { ...this.overrides(), ...this.fit(rect) }),
        draftLabel: `${round(rect.width, 1)} × ${round(rect.height, 1)}`,
      });
      return;
    }
    const origin = this.clickOrigin(template, e);
    this.ctx.patchOverlay({ draft: { ...template, x: origin.x, y: origin.y }, draftLabel: null });
  }

  onPointerUp(e: ToolPointerEvent): void {
    if (!this.start) return;
    const dragged = this.allowDrag && distance(e.screen, this.startScreen) >= DRAG_THRESHOLD;
    const template = this.getTemplate();
    const geometry: Patch = dragged
      ? this.fit(this.dragRect(e))
      : {
          ...this.clickOrigin(template, e),
          width: template.width,
          height: template.height,
        };
    this.start = null;
    const created = this.ctx.store.create(this.type, { ...this.overrides(), ...geometry });
    this.ctx.finishPlacement([created.id]);
  }

  cancel(): boolean {
    if (!this.start) return false;
    this.start = null;
    this.ctx.patchOverlay({ draft: null, draftLabel: null });
    return true;
  }

  deactivate(): void {
    this.start = null;
    this.template = null;
    this.templateSource = undefined;
    this.templateGridSource = undefined;
  }

  private dragRect(e: ToolPointerEvent): Bounds {
    const rect = boundsFromPoints(this.start!, this.ctx.snapWorld(e.world, e.alt));
    return { ...rect, width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  }

  /** Top-left corner that centres the template on the pointer. */
  private clickOrigin(template: WarehouseObject, e: ToolPointerEvent): Point {
    return this.ctx.snapWorld(
      { x: e.world.x - template.width / 2, y: e.world.y - template.height / 2 },
      e.alt,
    );
  }

  /** The ghost object is rebuilt only when the creation settings change. */
  private getTemplate(): WarehouseObject {
    const source = this.ctx.configs()[this.type];
    const gridSource = this.ctx.store.gridSettings();
    if (
      !this.template ||
      this.templateSource !== source ||
      this.templateGridSource !== gridSource
    ) {
      const overrides = this.overrides();
      if (this.type !== 'rack' && this.ctx.snapToGrid()) {
        const size = this.ctx.gridAlignedSize(
          Number(overrides['width']) || 1,
          Number(overrides['height']) || 1,
        );
        Object.assign(overrides, size);
      }
      this.template = this.ctx.store.preview(this.type, overrides);
      this.templateSource = source;
      this.templateGridSource = gridSource;
    }
    return this.template;
  }
}
