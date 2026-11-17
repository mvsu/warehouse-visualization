import {
  Bounds,
  Point,
  boundsFromPoints,
  boxAabb,
  boxCenter,
  distance,
  normalizeAngle,
  rotatePoint,
  round,
  toDeg,
  unionBounds,
} from '../../../core/utils/geometry';
import { Handle, hitHandle } from '../../../core/utils/handles';
import { Rack } from '../models/rack.model';
import { ObjectType, WarehouseObject } from '../models/warehouse-object.model';
import type { ToolService } from '../services/tool.service';
import type { Patch } from '../services/warehouse.service';
import { CanvasTool, ToolPointerEvent } from './tool.model';

type Mode = 'idle' | 'press' | 'move' | 'resize' | 'rotate' | 'marquee';

/** Large background objects: dragging across an unselected one starts a selection box instead of moving it. */
const CONTAINERS: ObjectType[] = ['space', 'image'];
const DRAG_THRESHOLD = 4;
/** View mode is read-only: only racks and areas react to the pointer. */
const VIEWABLE = (o: WarehouseObject) => o.type === 'rack' || o.type === 'space';

/** Selection, movement, resizing, rotation and drag-selection. */
export class SelectTool implements CanvasTool {
  readonly cursor = 'default';

  private mode: Mode = 'idle';
  private downScreen: Point = { x: 0, y: 0 };
  private downWorld: Point = { x: 0, y: 0 };
  private pressedId: string | null = null;
  private pressedWasSelected = false;
  private marqueeOnDrag = false;
  private baseSelection: string[] = [];
  private startObjects: WarehouseObject[] = [];
  private startBounds: Bounds | null = null;
  private snapTargets: Bounds[] = [];
  private handle: Handle | null = null;
  private changed = false;

  constructor(private readonly ctx: ToolService) {}

  onPointerDown(e: ToolPointerEvent): void {
    const { store, selection, viewport } = this.ctx;
    this.downScreen = e.screen;
    this.downWorld = e.world;
    this.changed = false;

    if (!store.editMode()) {
      const target = store.hitTest(e.world, VIEWABLE);
      selection.set(target ? [target.id] : []);
      selection.selectCell(
        target?.type === 'rack' ? (this.ctx.racks.cellAt(target as Rack, e.world)?.id ?? null) : null,
      );
      return;
    }

    const single = store.single();
    if (store.editMode() && single && !store.isLocked(single)) {
      const handle = hitHandle(single, viewport.transform(), e.screen, single.type !== 'rack');
      if (handle) {
        this.handle = handle;
        this.startObjects = [single];
        this.mode = handle.id === 'rotate' ? 'rotate' : 'resize';
        return;
      }
    }

    const hit = store.hitTest(e.world);
    if (!hit) {
      if (!e.shift) selection.clear();
      this.startMarquee();
      return;
    }

    const ids = store.groupMembers(hit.id);
    if (e.shift || e.ctrl) {
      selection.toggle(ids);
      return;
    }
    this.pressedId = hit.id;
    this.pressedWasSelected = selection.has(hit.id);
    this.marqueeOnDrag = !this.pressedWasSelected && CONTAINERS.includes(hit.type);
    if (!this.pressedWasSelected && !this.marqueeOnDrag) selection.set(ids);
    this.mode = 'press';
  }

  onPointerMove(e: ToolPointerEvent): void {
    switch (this.mode) {
      case 'idle':
        this.updateHoverCursor(e);
        break;
      case 'press':
        if (distance(e.screen, this.downScreen) < DRAG_THRESHOLD) break;
        if (this.marqueeOnDrag) {
          this.ctx.selection.clear();
          this.startMarquee();
          this.marquee(e);
        } else if (this.ctx.store.editMode()) {
          this.startMove();
          if (this.startObjects.length) {
            this.mode = 'move';
            this.move(e);
          }
        }
        break;
      case 'move':
        this.move(e);
        break;
      case 'resize':
        this.resize(e);
        break;
      case 'rotate':
        this.rotate(e);
        break;
      case 'marquee':
        this.marquee(e);
        break;
    }
  }

  onPointerUp(e: ToolPointerEvent): void {
    const { store, selection } = this.ctx;
    if (this.mode === 'press' && this.pressedId) {
      const ids = store.groupMembers(this.pressedId);
      const pressed = store.objectMap().get(this.pressedId);
      if (!this.pressedWasSelected) {
        selection.set(ids);
        // A first click on a rack also opens the bay level under the pointer.
        if (pressed?.type === 'rack' && ids.length === 1 && !this.changed)
          selection.selectCell(this.ctx.racks.cellAt(pressed as Rack, e.world)?.id ?? null);
      } else if (selection.count() > ids.length) {
        // Clicking one object of a multi-selection narrows the selection to it.
        selection.set(ids);
      } else if (pressed?.type === 'rack' && selection.count() === 1) {
        // Clicking an already selected rack drills into the cell under the pointer.
        selection.selectCell(this.ctx.racks.cellAt(pressed as Rack, e.world)?.id ?? null);
      }
    }
    if (this.changed) store.commit();
    this.reset();
    this.updateHoverCursor(e);
  }

  onDoubleClick(e: ToolPointerEvent): void {
    const { store, selection } = this.ctx;
    const hit = store.hitTest(e.world, store.editMode() ? undefined : VIEWABLE);
    if (hit?.type !== 'rack') return;
    selection.set([hit.id]);
    selection.selectCell(this.ctx.racks.cellAt(hit as Rack, e.world)?.id ?? null);
  }

  onContextMenu(e: ToolPointerEvent): void {
    const { store, selection } = this.ctx;
    const hit = store.hitTest(e.world, store.editMode() ? undefined : VIEWABLE);
    if (!hit) selection.clear();
    else if (!selection.has(hit.id)) selection.set(store.groupMembers(hit.id));
  }

  cancel(): boolean {
    if (this.mode === 'idle') return false;
    // Abort the drag and put everything back where it started.
    if (this.changed) {
      this.ctx.store.update(
        this.startObjects.map(
          (o) =>
            [o.id, { x: o.x, y: o.y, width: o.width, height: o.height, rotation: o.rotation }] as [
              string,
              Patch,
            ],
        ),
        'none',
      );
    }
    this.reset();
    return true;
  }

  deactivate(): void {
    this.reset();
  }

  private reset(): void {
    this.mode = 'idle';
    this.pressedId = null;
    this.handle = null;
    this.startObjects = [];
    this.startBounds = null;
    this.snapTargets = [];
    this.changed = false;
    this.ctx.clearOverlay();
  }

  // ---------------------------------------------------------------- move

  private startMove(): void {
    const { store, viewport } = this.ctx;
    this.startObjects = store.selected().filter((o) => !store.isLocked(o));
    this.startBounds = unionBounds(this.startObjects.map((o) => boxAabb(o)));
    const moving = new Set(this.startObjects.map((o) => o.id));
    // Only objects near the viewport are snapping candidates.
    const view = viewport.getVisibleWorldBounds();
    this.snapTargets = store
      .objectsInRect(view)
      .filter((o) => !moving.has(o.id) && o.type !== 'image')
      .map((o) => boxAabb(o));
  }

  private move(e: ToolPointerEvent): void {
    const { coords, viewport } = this.ctx;
    const start = this.startBounds;
    if (!start) return;
    let dx = e.world.x - this.downWorld.x;
    let dy = e.world.y - this.downWorld.y;
    if (e.shift) {
      // Constrain to the dominant axis.
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    let guides: ReturnType<typeof coords.snapBounds>['guides'] = [];
    if (!e.alt) {
      if (this.ctx.snapToObjects()) {
        const moved = {
          x: start.x + dx,
          y: start.y + dy,
          width: start.width,
          height: start.height,
        };
        const snap = coords.snapBounds(moved, this.snapTargets, 6 / viewport.scale());
        dx += snap.dx;
        dy += snap.dy;
        guides = snap.guides;
      }
      if (this.ctx.snapToGrid()) {
        const gridDx = coords.snap(start.x + dx, this.ctx.gridCellWidth()) - start.x;
        const gridDy = coords.snap(start.y + dy, this.ctx.gridCellHeight()) - start.y;
        if (Math.abs(gridDx - dx) > 1e-6) {
          dx = gridDx;
          guides = guides.filter((guide) => guide.axis !== 'x');
        }
        if (Math.abs(gridDy - dy) > 1e-6) {
          dy = gridDy;
          guides = guides.filter((guide) => guide.axis !== 'y');
        }
      }
    }
    this.ctx.store.update(
      this.startObjects.map(
        (o) => [o.id, { x: round(o.x + dx, 3), y: round(o.y + dy, 3) }] as [string, Patch],
      ),
      'none',
    );
    this.changed = true;
    this.ctx.patchOverlay({ guides });
    this.ctx.cursor.set('move');
  }

  // ---------------------------------------------------------------- resize

  /** Resizes around the handle opposite to the one being dragged; works for rotated objects too. */
  private resize(e: ToolPointerEvent): void {
    const o = this.startObjects[0];
    const h = this.handle;
    if (!o || !h) return;
    const c = boxCenter(o);
    const anchor = rotatePoint(
      { x: c.x - (h.hx * o.width) / 2, y: c.y - (h.hy * o.height) / 2 },
      c,
      o.rotation,
    );
    const axisAligned = o.rotation % 90 === 0;
    const pointer = axisAligned ? this.ctx.snapWorld(e.world, e.alt) : e.world;
    const local = rotatePoint(pointer, anchor, -o.rotation);
    let width = h.hx ? Math.max(1, h.hx * (local.x - anchor.x)) : o.width;
    let height = h.hy ? Math.max(1, h.hy * (local.y - anchor.y)) : o.height;
    if (e.shift && h.hx && h.hy) {
      const ratio = o.width / o.height;
      if (width / height > ratio) height = width / ratio;
      else width = height * ratio;
    }
    width = round(width, 3);
    height = round(height, 3);
    const center = rotatePoint(
      { x: anchor.x + (h.hx * width) / 2, y: anchor.y + (h.hy * height) / 2 },
      anchor,
      o.rotation,
    );
    this.ctx.store.update(
      [
        [
          o.id,
          { x: round(center.x - width / 2, 3), y: round(center.y - height / 2, 3), width, height },
        ],
      ],
      'none',
    );
    this.changed = true;
    this.ctx.cursor.set(h.cursor);
  }

  // ---------------------------------------------------------------- rotate

  private rotate(e: ToolPointerEvent): void {
    const o = this.startObjects[0];
    if (!o) return;
    const c = boxCenter(o);
    let angle = normalizeAngle(toDeg(Math.atan2(e.world.y - c.y, e.world.x - c.x)) + 90);
    if (e.shift) angle = Math.round(angle / 15) * 15;
    else {
      // Gently settle on right angles.
      const nearest = Math.round(angle / 90) * 90;
      angle = Math.abs(angle - nearest) < 3 ? nearest : Math.round(angle);
    }
    angle = normalizeAngle(angle);
    this.ctx.store.update([[o.id, { rotation: angle }]], 'none');
    this.changed = true;
    this.ctx.patchOverlay({ draftLabel: `${angle}°` });
    this.ctx.cursor.set('grabbing');
  }

  // ---------------------------------------------------------------- marquee

  private startMarquee(): void {
    this.baseSelection = this.ctx.selection.ids();
    this.mode = 'marquee';
  }

  private marquee(e: ToolPointerEvent): void {
    const { store, selection } = this.ctx;
    const rect = boundsFromPoints(this.downWorld, e.world);
    const hits = store.objectsInRect(rect).map((o) => o.id);
    selection.set(store.expandGroups([...this.baseSelection, ...hits]));
    this.ctx.patchOverlay({ marquee: rect });
  }

  // ---------------------------------------------------------------- hover

  private updateHoverCursor(e: ToolPointerEvent): void {
    const { store, viewport } = this.ctx;
    const editable = store.editMode();
    const single = store.single();
    if (editable && single && !store.isLocked(single)) {
      const handle = hitHandle(single, viewport.transform(), e.screen, single.type !== 'rack');
      if (handle) {
        this.ctx.cursor.set(handle.cursor);
        return;
      }
    }
    const hit = store.hitTest(e.world, editable ? undefined : VIEWABLE);
    this.ctx.cursor.set(
      hit ? (editable && this.ctx.selection.has(hit.id) ? 'move' : 'pointer') : null,
    );
  }
}
