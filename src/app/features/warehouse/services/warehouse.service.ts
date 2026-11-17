import { Injectable, computed, inject, signal } from '@angular/core';
import { CanvasViewportService } from '../../../core/services/canvas-viewport.service';
import { HistoryService } from '../../../core/services/history.service';
import { ToastService } from '../../../core/services/toast.service';
import { USE_MOCK_API } from '../../../core/services/warehouse-api.service';
import {
  DEFAULT_WAREHOUSE_ID,
  WarehouseDbService,
} from '../../../core/services/warehouse-db.service';
import { WarehouseStorageService } from '../../../core/services/warehouse-storage.service';
import { dbWarehouseId, isDbLayout, layoutFromDb, layoutToDb } from '../data/db.mapper';
import {
  Bounds,
  Point,
  boundsIntersect,
  boxAabb,
  pointInBox,
  round,
  unionBounds,
} from '../../../core/utils/geometry';
import { createObject, nextCode, takenCodes } from '../models/object-factory';
import { OBJECT_DEFS } from '../models/object-schema';
import { Rack, RackCell } from '../models/rack.model';
import {
  LAYOUT_SCHEMA_VERSION,
  LayoutSummary,
  LayoutViewState,
  SaveStatus,
  WarehouseGridSettings,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  WarehouseLayout,
  defaultGridSettings,
  defaultLayers,
} from '../models/warehouse.model';
import { ObjectType, WarehouseLayer, WarehouseObject } from '../models/warehouse-object.model';
import { WmsData } from '../models/wms-data.model';
import { ObjectSelectionService } from './object-selection.service';
import { RackService } from './rack.service';

/**
 * How a change enters the undo history:
 * - commit:   one undo step, immediately (discrete actions, end of a drag)
 * - debounce: merged into one undo step after a short pause (typing in the inspector, nudging)
 * - none:     not recorded yet (intermediate frames of a drag; the tool commits on pointer-up)
 */
export type CommitMode = 'commit' | 'debounce' | 'none';
export type AlignMode = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';
export type Patch = Record<string, unknown>;

interface Snapshot {
  objects: WarehouseObject[];
  layers: WarehouseLayer[];
  grid: WarehouseGridSettings;
}

const AUTOSAVE_DELAY = 1500;
/** Raise after editing the files in public/mock/db so the app reads them again. */
const MOCK_DB_VERSION = 'v1';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The warehouse document store: objects, layers, undo history and persistence.
 * State is immutable — every change produces new arrays/objects — which keeps signals,
 * undo snapshots and canvas rendering simple and cheap.
 */
@Injectable({ providedIn: 'root' })
export class WarehouseService {
  private readonly storage = inject(WarehouseStorageService);
  private readonly db = inject(WarehouseDbService);
  private readonly history = inject<HistoryService<Snapshot>>(HistoryService);
  private readonly selection = inject(ObjectSelectionService);
  private readonly racks = inject(RackService);
  private readonly viewport = inject(CanvasViewportService);
  private readonly toast = inject(ToastService);

  readonly layoutId = signal('');
  readonly name = signal('Untitled warehouse');
  readonly objects = signal<WarehouseObject[]>([]);
  readonly layers = signal<WarehouseLayer[]>(defaultLayers());
  readonly gridSettings = signal<WarehouseGridSettings>(defaultGridSettings());
  readonly editMode = signal(false);
  /** Items, pick lists and activity that came with the layout (view mode data). */
  readonly wms = signal<WmsData | null>(null);
  readonly saveStatus = signal<SaveStatus>('saved');
  readonly layouts = signal<LayoutSummary[]>([]);
  readonly ready = signal(false);
  readonly canUndo = this.history.canUndo;
  readonly canRedo = this.history.canRedo;

  readonly objectMap = computed(() => new Map(this.objects().map((o) => [o.id, o])));
  readonly layerMap = computed(() => new Map(this.layers().map((l) => [l.id, l])));

  /** Visible objects in drawing order: by layer (bottom first), then by position in the object list. */
  readonly renderList = computed(() => {
    const order = new Map(this.layers().map((l, i) => [l.id, i]));
    const layers = this.layerMap();
    return this.objects()
      .filter((o) => o.visible && (layers.get(o.layerId)?.visible ?? true))
      .map((o, i) => ({ o, i, layer: order.get(o.layerId) ?? 0 }))
      .sort((a, b) => a.layer - b.layer || a.i - b.i)
      .map((entry) => entry.o);
  });

  readonly selected = computed(() => {
    const map = this.objectMap();
    return this.selection
      .ids()
      .map((id) => map.get(id))
      .filter((o): o is WarehouseObject => !!o);
  });
  readonly single = computed(() => (this.selected().length === 1 ? this.selected()[0] : null));
  readonly selectedCell = computed<RackCell | null>(() => {
    const rack = this.single();
    const cellId = this.selection.cellId();
    if (!cellId || rack?.type !== 'rack') return null;
    return (rack as Rack).cells.find((c) => c.id === cellId) ?? null;
  });
  readonly selectionBounds = computed(() => unionBounds(this.selected().map((o) => boxAabb(o))));
  readonly contentBounds = computed(() => unionBounds(this.renderList().map((o) => boxAabb(o))));

  private committed: Snapshot = {
    objects: this.objects(),
    layers: this.layers(),
    grid: this.gridSettings(),
  };
  private commitTimer: ReturnType<typeof setTimeout> | undefined;
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private changeCounter = 0;
  private createdAt = new Date().toISOString();
  private clipboard: WarehouseObject[] = [];
  private pasteCount = 0;
  private pendingView: LayoutViewState | 'fit' | null = null;

  // ------------------------------------------------------------------ lifecycle & persistence

  /** Restores the last opened layout, or creates the sample warehouse on first launch. */
  async init(): Promise<void> {
    try {
      const list = await this.storage.list();
      this.layouts.set(list);
      if (await this.loadFromDatabase()) {
        this.ready.set(true);
        return;
      }
      const last = this.storage.getLastOpenedId();
      const target = list.find((l) => l.id === last) ?? list[0];
      const layout = target ? await this.storage.get(target.id) : null;
      if (layout) this.apply(layout);
      else await this.createEmpty();
    } catch {
      await this.createEmpty();
    }
    this.ready.set(true);
  }

  /**
   * Gets the warehouse from the database tables (WarehouseDbService) and puts it on the canvas.
   * With the real API this runs on every start, so the database is the source of truth.
   * The mock tables are static files, so they are read once (per MOCK_DB_VERSION) and the
   * browser copy keeps later edits; raise the version after changing the files in public/mock/db.
   */
  private async loadFromDatabase(): Promise<boolean> {
    const flag = `wd:dbSeeded:${MOCK_DB_VERSION}`;
    try {
      if (USE_MOCK_API && localStorage.getItem(flag)) return false;
      const snapshot = await this.db.load(DEFAULT_WAREHOUSE_ID);
      await this.importData(layoutFromDb(snapshot));
      if (USE_MOCK_API) localStorage.setItem(flag, '1');
      return true;
    } catch {
      return false;
    }
  }

  async createEmpty(): Promise<void> {
    this.apply(this.emptyLayout('Untitled warehouse', []));
    await this.saveNow();
  }

  async newLayout(name = 'Untitled warehouse'): Promise<void> {
    await this.saveIfDirty();
    this.apply(this.emptyLayout(name, []));
    this.editMode.set(true);
    await this.saveNow();
  }

  async openLayout(id: string): Promise<void> {
    if (id === this.layoutId()) return;
    await this.saveIfDirty();
    const layout = await this.storage.get(id);
    if (!layout) {
      this.toast.show('That layout could not be found in this browser.', 'error');
      await this.refreshLayouts();
      return;
    }
    this.apply(layout);
  }

  async duplicateLayout(): Promise<void> {
    await this.saveIfDirty();
    const copy = {
      ...this.toLayout(),
      id: uid(),
      name: `${this.name()} copy`,
      createdAt: new Date().toISOString(),
    };
    this.apply(copy);
    await this.saveNow();
    this.toast.show(`Duplicated as “${copy.name}”.`, 'success');
  }

  async deleteLayout(id: string): Promise<void> {
    await this.storage.delete(id);
    await this.refreshLayouts();
    if (id !== this.layoutId()) return;
    clearTimeout(this.autosaveTimer);
    const next = this.layouts()[0];
    const layout = next ? await this.storage.get(next.id) : null;
    if (layout) this.apply(layout);
    else {
      this.apply(this.emptyLayout('Untitled warehouse', []));
      await this.saveNow();
    }
  }

  rename(name: string): void {
    const next = name.trim();
    if (!next || next === this.name()) return;
    this.name.set(next);
    this.markDirty();
  }

  async saveNow(): Promise<void> {
    clearTimeout(this.autosaveTimer);
    this.flushCommit();
    const counter = this.changeCounter;
    this.saveStatus.set('saving');
    try {
      await Promise.all([this.storage.save(this.toLayout()), wait(300)]);
    } catch {
      this.saveStatus.set('unsaved');
      this.toast.show('Saving failed. Export the layout as JSON to keep a copy.', 'error');
      return;
    }
    if (counter === this.changeCounter) this.saveStatus.set('saved');
    else this.markDirty();
    await this.refreshLayouts();
    await this.saveToDatabase();
  }

  /** Writes racks, locations, aisles and objects of the database layout back to the database. */
  private async saveToDatabase(): Promise<void> {
    const id = this.layoutId();
    if (!isDbLayout(id)) return;
    const warehouseId = dbWarehouseId(id);
    try {
      await this.db.save(warehouseId, layoutToDb(this.toLayout(), warehouseId));
    } catch {
      this.saveStatus.set('unsaved');
      this.toast.show('Saving to the database failed. The changes are kept in this browser.', 'error');
    }
  }

  toLayout(): WarehouseLayout {
    return {
      id: this.layoutId(),
      name: this.name(),
      width: this.gridSettings().warehouseWidth,
      height: this.gridSettings().warehouseHeight,
      objects: this.objects(),
      layers: this.layers(),
      updatedAt: new Date().toISOString(),
      createdAt: this.createdAt,
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      view: {
        zoom: this.viewport.zoomScale(),
        offsetX: this.viewport.offsetX(),
        offsetY: this.viewport.offsetY(),
      },
      grid: this.gridSettings(),
      ...(this.wms() ? { wms: this.wms()! } : {}),
    };
  }

  exportJson(): string {
    return JSON.stringify(this.toLayout(), null, 2);
  }

  /** Opens a layout from exported JSON as a new warehouse. Throws with a readable message when the file is invalid. */
  async importJson(text: string): Promise<void> {
    let data: Partial<WarehouseLayout>;
    try {
      data = JSON.parse(text) as Partial<WarehouseLayout>;
    } catch {
      throw new Error('The file is not valid JSON.');
    }
    if (!data || !Array.isArray(data.objects))
      throw new Error('The file does not contain a warehouse layout (no "objects" list).');
    // An imported file always becomes a new browser layout, never the database one.
    await this.importData({ ...data, id: undefined });
  }

  /** Opens layout data. A given id (the database layout) replaces the stored layout with that id. */
  private async importData(data: Partial<WarehouseLayout>): Promise<void> {
    await this.saveIfDirty();
    const layout = this.emptyLayout(
      typeof data.name === 'string' && data.name ? data.name : 'Imported warehouse',
      data.objects ?? [],
    );
    if (data.id) layout.id = data.id;
    if (Array.isArray(data.layers)) layout.layers = data.layers;
    if (data.view) layout.view = data.view;
    if (data.wms) layout.wms = data.wms;
    if (data.grid) layout.grid = data.grid;
    else
      layout.grid = {
        ...defaultGridSettings(),
        warehouseWidth: Number(data.width) || WORLD_WIDTH,
        warehouseHeight: Number(data.height) || WORLD_HEIGHT,
      };
    this.apply(layout);
    await this.saveNow();
  }

  /** Called once the canvas knows its size so the default 2,000 px range can fit the viewport. */
  applyPendingView(): void {
    const view = this.pendingView;
    if (!view || !this.viewport.viewportWidth()) return;
    this.pendingView = null;
    if (view !== 'fit') this.viewport.setView(view.zoom, view.offsetX, view.offsetY);
    else this.viewport.setView(1, 0, 0);
  }

  private apply(layout: WarehouseLayout): void {
    clearTimeout(this.commitTimer);
    clearTimeout(this.autosaveTimer);
    this.layoutId.set(layout.id);
    this.name.set(layout.name);
    this.createdAt = layout.createdAt ?? new Date().toISOString();
    const grid = this.sanitizeGrid(
      layout.grid ?? {
        ...defaultGridSettings(),
        warehouseWidth: layout.width,
        warehouseHeight: layout.height,
      },
    );
    this.gridSettings.set(grid);
    this.viewport.setWorldSize(grid.warehouseWidth, grid.warehouseHeight);
    this.layers.set(this.sanitizeLayers(layout.layers));
    this.objects.set(this.sanitizeObjects(layout.objects));
    this.wms.set(layout.wms ?? null);
    this.selection.clear();
    this.history.clear();
    this.committed = this.snapshot();
    this.saveStatus.set('saved');
    this.storage.setLastOpenedId(layout.id);
    this.pendingView = layout.view ?? 'fit';
    this.applyPendingView();
  }

  private emptyLayout(name: string, objects: WarehouseObject[]): WarehouseLayout {
    const now = new Date().toISOString();
    return {
      id: uid(),
      name,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      objects,
      layers: defaultLayers(),
      updatedAt: now,
      createdAt: now,
      grid: defaultGridSettings(),
    };
  }

  private sanitizeGrid(input: Partial<WarehouseGridSettings>): WarehouseGridSettings {
    const defaults = defaultGridSettings();
    const number = (value: unknown, fallback: number, min: number, max: number) =>
      Math.min(max, Math.max(min, Math.round(Number(value) || fallback)));
    return {
      cellWidth: number(input.cellWidth, defaults.cellWidth, 1, WORLD_WIDTH),
      cellHeight: number(input.cellHeight, defaults.cellHeight, 1, WORLD_HEIGHT),
      warehouseWidth: number(input.warehouseWidth, defaults.warehouseWidth, 2_000, WORLD_WIDTH),
      warehouseHeight: number(input.warehouseHeight, defaults.warehouseHeight, 2_000, WORLD_HEIGHT),
      visible: input.visible !== false,
      snap: input.snap !== false,
    };
  }

  /** Repairs loaded / imported data so the rest of the app can rely on complete objects. */
  private sanitizeObjects(input: unknown[]): WarehouseObject[] {
    // Reserve every id present in the file so generated ids can never collide with them.
    const taken = new Set<string>(
      input
        .map((raw) => (raw as Partial<WarehouseObject>)?.id)
        .filter((id): id is string => typeof id === 'string'),
    );
    const seen = new Set<string>();
    const layerIds = new Set(this.layers().map((l) => l.id));
    const result: WarehouseObject[] = [];
    const num = (v: unknown, fallback: number) =>
      Number.isFinite(Number(v)) ? Number(v) : fallback;
    for (const raw of input) {
      const src = { ...(raw as Partial<WarehouseObject>) };
      const def = src && OBJECT_DEFS[src.type as ObjectType];
      if (!def) continue;
      // Missing or duplicated ids are replaced with freshly generated ones.
      if (typeof src.id !== 'string' || !src.id || seen.has(src.id)) delete src.id;
      const o = createObject(def.type, taken, {
        ...src,
        x: num(src.x, 0),
        y: num(src.y, 0),
        width: Math.max(0.5, num(src.width, def.size[0])),
        height: Math.max(0.5, num(src.height, def.size[1])),
        rotation: num(src.rotation, 0),
        visible: src.visible !== false,
        locked: !!src.locked,
        layerId: src.layerId && layerIds.has(src.layerId) ? src.layerId : def.layerId,
        properties: src.properties ?? {},
        ...(def.type === 'rack'
          ? {
              cellWidth: num(
                (src as Partial<Rack>).cellWidth,
                (num(src.width, def.size[0]) -
                  num((src as Partial<Rack>).columnSpacing, 0) *
                    (num((src as Partial<Rack>).columns, 1) - 1)) /
                  num((src as Partial<Rack>).columns, 1),
              ),
              cellHeight: num(
                (src as Partial<Rack>).cellHeight,
                (num(src.height, def.size[1]) -
                  num((src as Partial<Rack>).rowSpacing, 0) *
                    (num((src as Partial<Rack>).rows, 1) - 1)) /
                  num((src as Partial<Rack>).rows, 1),
              ),
            }
          : {}),
      });
      seen.add(o.id);
      const prepared = o.type === 'rack' ? this.racks.reconcile(null, o as Rack, []) : o;
      result.push(this.constrainToWorld(prepared));
    }
    return result;
  }

  private sanitizeLayers(input: WarehouseLayer[] | undefined): WarehouseLayer[] {
    const defaults = defaultLayers();
    if (!Array.isArray(input) || !input.length) return defaults;
    const layers = input
      .filter((l) => l && typeof l.id === 'string')
      .map((l) => ({
        id: l.id,
        name: String(l.name ?? l.id),
        visible: l.visible !== false,
        locked: !!l.locked,
      }));
    // Layers added in newer versions are appended so every object type has a home.
    for (const d of defaults) if (!layers.some((l) => l.id === d.id)) layers.push(d);
    return layers;
  }

  private async saveIfDirty(): Promise<void> {
    if (this.layoutId() && this.saveStatus() !== 'saved') await this.saveNow();
  }

  private async refreshLayouts(): Promise<void> {
    try {
      this.layouts.set(await this.storage.list());
    } catch {
      /* the list is cosmetic; keep the previous one */
    }
  }

  private markDirty(): void {
    this.changeCounter++;
    this.saveStatus.set('unsaved');
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.saveNow(), AUTOSAVE_DELAY);
  }

  // ------------------------------------------------------------------ history

  /** Records everything changed since the last commit as one undo step. */
  commit(): void {
    clearTimeout(this.commitTimer);
    this.commitTimer = undefined;
    if (
      this.committed.objects === this.objects() &&
      this.committed.layers === this.layers() &&
      this.committed.grid === this.gridSettings()
    )
      return;
    this.history.push(this.committed);
    this.committed = this.snapshot();
    this.markDirty();
  }

  undo(): void {
    this.flushCommit();
    const state = this.history.undo(this.snapshot());
    if (state) this.restore(state);
  }

  redo(): void {
    this.flushCommit();
    const state = this.history.redo(this.snapshot());
    if (state) this.restore(state);
  }

  private flushCommit(): void {
    if (
      this.commitTimer !== undefined ||
      this.committed.objects !== this.objects() ||
      this.committed.layers !== this.layers()
    )
      this.commit();
  }

  private snapshot(): Snapshot {
    return { objects: this.objects(), layers: this.layers(), grid: this.gridSettings() };
  }

  private restore(state: Snapshot): void {
    this.objects.set(state.objects);
    this.layers.set(state.layers);
    this.gridSettings.set(state.grid);
    this.viewport.setWorldSize(state.grid.warehouseWidth, state.grid.warehouseHeight);
    this.committed = state;
    const map = this.objectMap();
    this.selection.set(this.selection.ids().filter((id) => map.has(id)));
    this.markDirty();
  }

  private after(mode: CommitMode): void {
    if (mode === 'commit') this.commit();
    else if (mode === 'debounce') {
      clearTimeout(this.commitTimer);
      this.commitTimer = setTimeout(() => this.commit(), 450);
      this.markDirty();
    }
  }

  // ------------------------------------------------------------------ objects

  updateGridSettings(input: WarehouseGridSettings): void {
    const next = this.sanitizeGrid(input);
    const current = this.gridSettings();
    const geometryChanged =
      next.cellWidth !== current.cellWidth ||
      next.cellHeight !== current.cellHeight ||
      next.warehouseWidth !== current.warehouseWidth ||
      next.warehouseHeight !== current.warehouseHeight;
    if (
      next.cellWidth === current.cellWidth &&
      next.cellHeight === current.cellHeight &&
      next.warehouseWidth === current.warehouseWidth &&
      next.warehouseHeight === current.warehouseHeight &&
      next.visible === current.visible &&
      next.snap === current.snap
    )
      return;

    this.gridSettings.set(next);
    this.viewport.setWorldSize(next.warehouseWidth, next.warehouseHeight);
    if (geometryChanged)
      this.objects.update((objects) =>
        objects.map((object) => this.reflowToGrid(object, current, next)),
      );
    this.commit();
    if (!geometryChanged) return;
    const count = this.objects().length;
    this.toast.show(
      count
        ? `Grid updated. ${count} existing ${count === 1 ? 'object was' : 'objects were'} resized and aligned.`
        : 'Grid settings applied.',
      'success',
    );
  }

  /** Creates an object of the given type with unique IDs and adds it to the layout. */
  create(type: ObjectType, overrides: Patch = {}, mode: CommitMode = 'commit'): WarehouseObject {
    const object = this.prepare(createObject(type, takenCodes(this.objects()), overrides));
    this.objects.update((list) => [...list, object]);
    this.after(mode);
    return object;
  }

  /** Builds a detached object (not added to the layout) — used for placement previews. */
  preview(type: ObjectType, overrides: Patch = {}): WarehouseObject {
    return this.prepare(createObject(type, takenCodes(this.objects()), overrides));
  }

  update(patches: Iterable<[string, Patch]>, mode: CommitMode = 'commit'): void {
    const map = new Map(patches);
    if (!map.size) return;
    this.objects.update((list) =>
      list.map((o) => {
        const patch = map.get(o.id);
        return patch ? this.merge(o, patch) : o;
      }),
    );
    this.after(mode);
  }

  remove(ids: string[]): void {
    const set = new Set(ids);
    if (!set.size) return;
    this.objects.update((list) => list.filter((o) => !set.has(o.id)));
    this.selection.set(this.selection.ids().filter((id) => !set.has(id)));
    this.commit();
  }

  duplicate(ids: string[]): string[] {
    const sources = this.resolve(ids);
    if (!sources.length) return [];
    const grid = this.gridSettings();
    const stepX = grid.snap ? grid.cellWidth : Math.max(10, Math.round(16 / this.viewport.scale()));
    const stepY = grid.snap
      ? grid.cellHeight
      : Math.max(10, Math.round(16 / this.viewport.scale()));
    const clones = this.clone(sources, stepX, stepY);
    this.objects.update((list) => [...list, ...clones]);
    this.commit();
    this.selection.set(clones.map((c) => c.id));
    return clones.map((c) => c.id);
  }

  copy(ids: string[]): number {
    this.clipboard = this.resolve(ids);
    this.pasteCount = 0;
    return this.clipboard.length;
  }

  /** Pastes at the pointer when it is over the canvas, otherwise next to the originals. */
  paste(): string[] {
    if (!this.clipboard.length) return [];
    const bounds = unionBounds(this.clipboard.map((o) => boxAabb(o)))!;
    const mouse = this.viewport.mouseWorld();
    this.pasteCount++;
    let dx = this.pasteCount * 20;
    let dy = this.pasteCount * 20;
    if (mouse) {
      dx = Math.round(mouse.x - (bounds.x + bounds.width / 2));
      dy = Math.round(mouse.y - (bounds.y + bounds.height / 2));
    }
    const clones = this.clone(this.clipboard, dx, dy);
    this.objects.update((list) => [...list, ...clones]);
    this.commit();
    this.selection.set(clones.map((c) => c.id));
    return clones.map((c) => c.id);
  }

  hasClipboard(): boolean {
    return this.clipboard.length > 0;
  }

  group(ids: string[]): void {
    if (ids.length < 2) return;
    const groupId = `grp_${uid()}`;
    this.update(ids.map((id) => [id, { groupId }] as [string, Patch]));
  }

  ungroup(ids: string[]): void {
    const targets = this.resolve(ids).filter((o) => o.groupId);
    this.update(targets.map((o) => [o.id, { groupId: undefined }] as [string, Patch]));
  }

  setLocked(ids: string[], locked: boolean): void {
    this.update(ids.map((id) => [id, { locked }] as [string, Patch]));
  }

  bringToFront(ids: string[]): void {
    const set = new Set(ids);
    this.objects.update((list) => [
      ...list.filter((o) => !set.has(o.id)),
      ...list.filter((o) => set.has(o.id)),
    ]);
    this.commit();
  }

  sendToBack(ids: string[]): void {
    const set = new Set(ids);
    this.objects.update((list) => [
      ...list.filter((o) => set.has(o.id)),
      ...list.filter((o) => !set.has(o.id)),
    ]);
    this.commit();
  }

  nudge(ids: string[], dx: number, dy: number): void {
    const targets = this.resolve(ids).filter((o) => !this.isLocked(o));
    this.update(
      targets.map((o) => [o.id, { x: o.x + dx, y: o.y + dy }] as [string, Patch]),
      'debounce',
    );
  }

  align(ids: string[], mode: AlignMode): void {
    const targets = this.resolve(ids).filter((o) => !this.isLocked(o));
    const all = unionBounds(targets.map((o) => boxAabb(o)));
    if (!all || targets.length < 2) return;
    this.update(
      targets.map((o) => {
        const b = boxAabb(o);
        let dx = 0;
        let dy = 0;
        if (mode === 'left') dx = all.x - b.x;
        if (mode === 'right') dx = all.x + all.width - (b.x + b.width);
        if (mode === 'center-h') dx = all.x + all.width / 2 - (b.x + b.width / 2);
        if (mode === 'top') dy = all.y - b.y;
        if (mode === 'bottom') dy = all.y + all.height - (b.y + b.height);
        if (mode === 'center-v') dy = all.y + all.height / 2 - (b.y + b.height / 2);
        return [o.id, { x: round(o.x + dx, 3), y: round(o.y + dy, 3) }] as [string, Patch];
      }),
    );
  }

  /** Spaces objects so the gaps between them are equal. */
  distribute(ids: string[], axis: 'h' | 'v'): void {
    const targets = this.resolve(ids).filter((o) => !this.isLocked(o));
    if (targets.length < 3) return;
    const horizontal = axis === 'h';
    const items = targets
      .map((o) => ({ o, b: boxAabb(o) }))
      .sort((a, b) => (horizontal ? a.b.x - b.b.x : a.b.y - b.b.y));
    const size = (b: Bounds) => (horizontal ? b.width : b.height);
    const start = (b: Bounds) => (horizontal ? b.x : b.y);
    const first = items[0].b;
    const last = items[items.length - 1].b;
    const total = items.reduce((sum, it) => sum + size(it.b), 0);
    const gap = (start(last) + size(last) - start(first) - total) / (items.length - 1);
    let cursor = start(first);
    this.update(
      items.map((it) => {
        const delta = cursor - start(it.b);
        cursor += size(it.b) + gap;
        return [
          it.o.id,
          horizontal ? { x: round(it.o.x + delta, 3) } : { y: round(it.o.y + delta, 3) },
        ] as [string, Patch];
      }),
    );
  }

  updateCell(rackObjectId: string, cellId: string, patch: Partial<RackCell>): void {
    const rack = this.objectMap().get(rackObjectId) as Rack | undefined;
    if (rack?.type !== 'rack') return;
    const cells = rack.cells.map((c) => (c.id === cellId ? { ...c, ...patch } : c));
    this.objects.update((list) =>
      list.map((o) => (o.id === rackObjectId ? ({ ...rack, cells } as WarehouseObject) : o)),
    );
    this.after('debounce');
  }

  /** Adds an uploaded floor plan or imported SVG as a scalable background object. */
  addImage(
    src: string,
    naturalWidth: number,
    naturalHeight: number,
    name: string,
  ): WarehouseObject {
    const view = this.viewport.getVisibleWorldBounds();
    const fit =
      Math.min(1, (view.width * 0.8) / naturalWidth, (view.height * 0.8) / naturalHeight) || 1;
    const width = Math.max(10, Math.round(naturalWidth * fit));
    const height = Math.max(10, Math.round(naturalHeight * fit));
    const image = this.create('image', {
      name,
      src,
      width,
      height,
      x: Math.max(0, Math.round(view.x + (view.width - width) / 2)),
      y: Math.max(0, Math.round(view.y + (view.height - height) / 2)),
    });
    this.selection.set([image.id]);
    return image;
  }

  // ------------------------------------------------------------------ layers

  patchLayer(id: string, patch: Partial<WarehouseLayer>): void {
    this.layers.update((list) => list.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    this.commit();
  }

  /** `ids` lists every layer bottom-to-top. */
  reorderLayers(ids: string[]): void {
    const map = this.layerMap();
    const next = ids.map((id) => map.get(id)).filter((l): l is WarehouseLayer => !!l);
    if (next.length !== this.layers().length) return;
    this.layers.set(next);
    this.commit();
  }

  selectLayer(layerId: string): void {
    this.selection.set(
      this.objects()
        .filter((o) => o.layerId === layerId)
        .map((o) => o.id),
    );
  }

  layerCount(layerId: string): number {
    return this.objects().reduce((n, o) => n + (o.layerId === layerId ? 1 : 0), 0);
  }

  // ------------------------------------------------------------------ queries

  isLocked(o: WarehouseObject): boolean {
    return o.locked || !!this.layerMap().get(o.layerId)?.locked;
  }

  /** Top-most selectable object under a world point. Locked objects are skipped, like in Figma. */
  hitTest(world: Point, accept?: (o: WarehouseObject) => boolean): WarehouseObject | null {
    const scale = this.viewport.scale();
    const list = this.renderList();
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (this.isLocked(o) || (accept && !accept(o))) continue;
      // Thin objects get a larger grab area.
      const thin = Math.min(o.width, o.height) * scale < 10;
      if (pointInBox(world, o, (thin ? 6 : 2) / scale)) return o;
    }
    return null;
  }

  objectsInRect(rect: Bounds): WarehouseObject[] {
    return this.renderList().filter((o) => !this.isLocked(o) && boundsIntersect(boxAabb(o), rect));
  }

  /** The object's id plus the ids of everything grouped with it. */
  groupMembers(id: string): string[] {
    const o = this.objectMap().get(id);
    if (!o?.groupId) return [id];
    return this.objects()
      .filter((other) => other.groupId === o.groupId)
      .map((other) => other.id);
  }

  expandGroups(ids: Iterable<string>): string[] {
    const result = new Set<string>();
    for (const id of ids) for (const member of this.groupMembers(id)) result.add(member);
    return [...result];
  }

  // ------------------------------------------------------------------ internals

  private resolve(ids: string[]): WarehouseObject[] {
    const map = this.objectMap();
    return ids.map((id) => map.get(id)).filter((o): o is WarehouseObject => !!o);
  }

  private prepare(o: WarehouseObject): WarehouseObject {
    const aligned = this.alignGeometry(o, ['x', 'y', 'width', 'height']);
    const prepared =
      aligned.type === 'rack' ? this.racks.reconcile(null, aligned as Rack, []) : aligned;
    return this.constrainToWorld(prepared);
  }

  /** Applies a patch, rejecting non-finite geometry and keeping racks consistent. */
  private merge(o: WarehouseObject, patch: Patch): WarehouseObject {
    const next = { ...o, ...patch } as WarehouseObject;
    for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const) {
      if (!Number.isFinite(next[key])) next[key] = o[key];
    }
    next.width = Math.max(0.5, next.width);
    next.height = Math.max(0.5, next.height);
    const aligned = this.alignGeometry(next, Object.keys(patch));
    const prepared =
      aligned.type === 'rack'
        ? this.racks.reconcile(o as Rack, aligned as Rack, Object.keys(patch))
        : aligned;
    return this.constrainToWorld(prepared);
  }

  private constrainToWorld(o: WarehouseObject): WarehouseObject {
    const world = this.gridSettings();
    const width =
      o.type === 'rack'
        ? Math.max(0.5, o.width)
        : Math.min(world.warehouseWidth, Math.max(0.5, o.width));
    const height =
      o.type === 'rack'
        ? Math.max(0.5, o.height)
        : Math.min(world.warehouseHeight, Math.max(0.5, o.height));
    const sized = {
      ...o,
      width,
      height,
    } as WarehouseObject;
    if (sized.rotation % 360) {
      const bounds = boxAabb(sized);
      const dx =
        bounds.x < 0
          ? -bounds.x
          : bounds.x + bounds.width > world.warehouseWidth
            ? world.warehouseWidth - (bounds.x + bounds.width)
            : 0;
      const dy =
        bounds.y < 0
          ? -bounds.y
          : bounds.y + bounds.height > world.warehouseHeight
            ? world.warehouseHeight - (bounds.y + bounds.height)
            : 0;
      return { ...sized, x: sized.x + dx, y: sized.y + dy };
    }
    return {
      ...sized,
      x: Math.min(Math.max(0, world.warehouseWidth - width), Math.max(0, sized.x)),
      y: Math.min(Math.max(0, world.warehouseHeight - height), Math.max(0, sized.y)),
    };
  }

  /**
   * Keeps an object's cell position and occupied cell count when the configured grid changes.
   * Racks are rebuilt from their rows/columns so every rack cell becomes exactly one new grid cell.
   */
  private reflowToGrid(
    object: WarehouseObject,
    previous: WarehouseGridSettings,
    next: WarehouseGridSettings,
  ): WarehouseObject {
    const x = Math.round(object.x / previous.cellWidth) * next.cellWidth;
    const y = Math.round(object.y / previous.cellHeight) * next.cellHeight;
    if (object.type === 'rack') {
      const rack = object as Rack;
      const resized = this.racks.reconcile(
        rack,
        {
          ...rack,
          x,
          y,
          cellWidth: next.cellWidth,
          cellHeight: next.cellHeight,
          rowSpacing: 0,
          columnSpacing: 0,
        },
        ['cellWidth', 'cellHeight', 'rowSpacing', 'columnSpacing'],
      );
      return this.constrainToWorld(resized);
    }
    const widthCells = Math.max(1, Math.ceil(object.width / previous.cellWidth));
    const heightCells = Math.max(1, Math.ceil(object.height / previous.cellHeight));
    return this.constrainToWorld({
      ...object,
      x,
      y,
      width: widthCells * next.cellWidth,
      height: heightCells * next.cellHeight,
    });
  }

  private alignGeometry(o: WarehouseObject, changed: string[]): WarehouseObject {
    const grid = this.gridSettings();
    if (!grid.snap) return o;
    const next = { ...o };
    if (changed.includes('x')) next.x = this.snap(next.x, grid.cellWidth);
    if (changed.includes('y')) next.y = this.snap(next.y, grid.cellHeight);
    if (o.type !== 'rack' && changed.includes('width'))
      next.width = Math.max(grid.cellWidth, this.snap(next.width, grid.cellWidth));
    if (o.type !== 'rack' && changed.includes('height'))
      next.height = Math.max(grid.cellHeight, this.snap(next.height, grid.cellHeight));
    return next;
  }

  private clone(sources: WarehouseObject[], dx: number, dy: number): WarehouseObject[] {
    const taken = takenCodes(this.objects());
    const groups = new Map<string, string>();
    return sources.map((src) => {
      const def = OBJECT_DEFS[src.type];
      const id = nextCode(def.prefix, taken);
      let groupId: string | undefined;
      if (src.groupId) {
        if (!groups.has(src.groupId)) groups.set(src.groupId, `grp_${uid()}`);
        groupId = groups.get(src.groupId);
      }
      const copy = {
        ...src,
        id,
        [def.idKey]: id,
        x: this.gridSettings().snap
          ? this.snap(src.x + dx, this.gridSettings().cellWidth)
          : src.x + dx,
        y: this.gridSettings().snap
          ? this.snap(src.y + dy, this.gridSettings().cellHeight)
          : src.y + dy,
        locked: false,
        groupId,
      } as WarehouseObject;
      if (copy.type !== 'rack') return copy;
      // A copied rack is a new, empty physical rack: new cell IDs, no locations and no stock.
      return this.racks.reconcile(src as Rack, { ...(copy as Rack), cells: [] }, ['rackId']);
    });
  }

  private snap(value: number, step: number): number {
    return Math.round(value / step) * step;
  }
}
