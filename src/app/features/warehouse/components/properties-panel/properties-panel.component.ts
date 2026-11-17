import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  boxCenter,
  normalizeAngle,
  rotatePoint,
  round,
} from '../../../../core/utils/geometry';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import {
  FieldOption,
  PropertyFieldComponent,
} from '../../../../shared/components/property-field/property-field.component';
import { ToolbarButtonComponent } from '../../../../shared/components/toolbar-button/toolbar-button.component';
import {
  FieldDef,
  OBJECT_DEFS,
  ObjectTypeDef,
  coerceField,
  readField,
  writeField,
} from '../../models/object-schema';
import { CELL_STATUSES, Rack, RackCell, STOCK_COLORS } from '../../models/rack.model';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../models/warehouse.model';
import { ObjectType, WarehouseObject } from '../../models/warehouse-object.model';
import { EditorActionsService } from '../../services/editor-actions.service';
import { ObjectSelectionService } from '../../services/object-selection.service';
import { ToolService } from '../../services/tool.service';
import { AlignMode, Patch, WarehouseService } from '../../services/warehouse.service';
import { RackPreviewComponent, RackPreviewModel } from '../rack-preview/rack-preview.component';

type Controls = Record<string, FormControl>;

interface Section {
  title: string;
  kind: 'fields' | 'preview' | 'cell' | 'stock';
  fields: FieldDef[];
}

interface FormState {
  key: string;
  def: ObjectTypeDef;
  form: FormGroup<Controls>;
  fields: FieldDef[];
  sections: Section[];
}

const CELL_FIELDS: FieldDef[] = [
  { key: 'positionId', label: 'Position ID', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'select', options: CELL_STATUSES },
  { key: 'sku', label: 'SKU / item', kind: 'text' },
  { key: 'capacity', label: 'Capacity', kind: 'number', min: 0, max: 100000, step: 1 },
];

const MULTI_FIELDS: FieldDef[] = [
  { key: 'x', label: 'X position', kind: 'number', suffix: 'px' },
  { key: 'y', label: 'Y position', kind: 'number', suffix: 'px' },
  { key: 'rotation', label: 'Rotation', kind: 'number', min: -360, max: 360, suffix: '°' },
  { key: 'layerId', label: 'Layer', kind: 'select' },
];

/**
 * Floating inspector. Its content is generated from the object schema:
 *  - a creation tool is active → settings for the object about to be placed
 *  - one object selected       → that object's properties (plus rack cell and mapping sections)
 *  - several objects selected  → shared properties, alignment and arrange actions
 * Every edit is written straight to the store, so the canvas updates as you type.
 */
@Component({
  standalone: true,
  selector: 'app-properties-panel',
  imports: [
    ReactiveFormsModule,
    PropertyFieldComponent,
    IconComponent,
    ToolbarButtonComponent,
    RackPreviewComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.scss',
})
export class PropertiesPanelComponent {
  protected readonly store = inject(WarehouseService);
  protected readonly tools = inject(ToolService);
  protected readonly actions = inject(EditorActionsService);
  private readonly selection = inject(ObjectSelectionService);

  protected readonly cellFields = CELL_FIELDS;
  protected readonly multiFields = MULTI_FIELDS;
  protected readonly collapsedSections = signal<ReadonlySet<string>>(new Set());

  protected readonly single = this.store.single;
  protected readonly count = this.selection.count;
  protected readonly editable = computed(() => this.store.editMode());
  protected readonly creationType = this.tools.creationType;
  /** The inspector is an editing tool; view mode shows the read-only slider instead. */
  protected readonly visible = computed(
    () => !!this.creationType() || (this.store.editMode() && this.count() > 0),
  );

  protected readonly layerOptions = computed<FieldOption[]>(() =>
    [...this.store.layers()].reverse().map((l) => ({ value: l.id, label: l.name })),
  );

  protected readonly header = computed<{ icon: IconName; title: string; subtitle: string }>(() => {
    const creating = this.creationType();
    if (creating) {
      const def = OBJECT_DEFS[creating];
      return {
        icon: def.icon,
        title: `New ${def.label.toLowerCase()}`,
        subtitle: 'Set it up, then place it on the canvas',
      };
    }
    const o = this.single();
    if (o) {
      const def = OBJECT_DEFS[o.type];
      const id = (o as unknown as Record<string, unknown>)[def.idKey];
      return { icon: def.icon, title: o.name || def.label, subtitle: `${def.label} · ${id}` };
    }
    return {
      icon: 'group',
      title: `${this.count()} objects selected`,
      subtitle: 'Shared properties',
    };
  });

  // ---------------------------------------------------------------- single selection

  private readonly singleKey = computed(() => {
    const o = this.single();
    return o && !this.creationType() ? `${o.id}|${o.type}` : null;
  });

  /** Rebuilt only when a different object is selected, never while the same object is being edited. */
  protected readonly singleState = computed<FormState | null>(() => {
    if (!this.singleKey()) return null;
    return untracked(() => this.buildSingle(this.single()!));
  });

  protected readonly values = computed<Record<string, unknown>>(() => {
    const o = this.single();
    const state = this.singleState();
    if (!o || !state) return {};
    return Object.fromEntries(state.fields.map((f) => [f.key, readField(o, f)]));
  });

  protected readonly rackPreview = computed<RackPreviewModel | null>(() => {
    const o = this.single();
    return o?.type === 'rack' ? (o as Rack) : null;
  });

  // ---------------------------------------------------------------- rack cell

  protected readonly cell = this.store.selectedCell;
  protected readonly cellPosition = computed(() => {
    const rack = this.single();
    const cell = this.cell();
    if (rack?.type !== 'rack' || !cell) return null;
    const point = rotatePoint(
      { x: rack.x + cell.x, y: rack.y + cell.y },
      boxCenter(rack),
      rack.rotation,
    );
    return { x: round(point.x, 1), y: round(point.y, 1) };
  });
  /** Stock held in the selected bay level, shown at the top of the panel. */
  protected readonly stockLegend = Object.entries(STOCK_COLORS);
  protected readonly stock = computed(() => {
    const cell = this.cell();
    if (!cell) return null;
    const items = cell.items ?? [];
    const status = cell.status ?? 'Empty';
    return {
      code: cell.locationCode || cell.positionId,
      level: cell.row,
      bay: cell.column,
      status,
      color: STOCK_COLORS[status] ?? '#94A3B8',
      items,
      quantity: cell.quantity ?? items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
      capacity: cell.capacity,
    };
  });
  protected readonly cellState = computed(() => {
    if (!this.selection.cellId()) return null;
    return untracked(() => {
      const cell = this.cell();
      return cell ? { cellId: cell.id, form: this.buildCellForm(cell) } : null;
    });
  });

  // ---------------------------------------------------------------- multi selection

  protected readonly multiForm = new FormGroup<Controls>({
    x: new FormControl<number | null>(null),
    y: new FormControl<number | null>(null),
    rotation: new FormControl<number | null>(null),
    layerId: new FormControl<string>(''),
  });

  protected readonly multiValues = computed<Record<string, unknown>>(() => {
    const objects = this.store.selected();
    const bounds = this.store.selectionBounds();
    const same = <T>(pick: (o: WarehouseObject) => T): T | null =>
      objects.length && objects.every((o) => pick(o) === pick(objects[0]))
        ? pick(objects[0])
        : null;
    return {
      x: bounds ? round(bounds.x, 2) : null,
      y: bounds ? round(bounds.y, 2) : null,
      width: bounds ? round(bounds.width, 2) : 0,
      height: bounds ? round(bounds.height, 2) : 0,
      rotation: same((o) => o.rotation),
      layerId: same((o) => o.layerId) ?? '',
    };
  });

  // ---------------------------------------------------------------- creation settings

  protected readonly creationState = computed<FormState | null>(() => {
    const type = this.creationType();
    if (!type || type === 'rack') return null;
    return untracked(() => this.buildCreation(type));
  });

  protected readonly creationValues = computed<Patch>(() => {
    const type = this.creationType();
    return type ? this.tools.config(type) : {};
  });

  protected readonly pendingRack = computed<
    (RackPreviewModel & { name: string; rackId: string }) | null
  >(() => {
    if (this.creationType() !== 'rack') return null;
    const c = this.tools.config('rack');
    return {
      name: String(c['name'] ?? 'Rack'),
      rackId: String(c['rackId'] ?? ''),
      rows: Number(c['rows']),
      columns: Number(c['columns']),
      width: Number(c['width']),
      height: Number(c['height']),
      rowSpacing: Number(c['rowSpacing']),
      columnSpacing: Number(c['columnSpacing']),
      color: String(c['color']),
    };
  });

  constructor() {
    this.multiForm.valueChanges.subscribe(() => this.applyMulti());

    // Keep the single-object form in step with the model (canvas drags, undo, other panels).
    effect(() => {
      const state = this.singleState();
      const o = this.single();
      const enabled = this.editable() && !!o && !o.locked;
      if (state && o)
        untracked(() =>
          this.syncControls(state.form, state.fields, (f) => readField(o, f), enabled),
        );
    });

    effect(() => {
      const state = this.cellState();
      const cell = this.cell();
      const enabled = this.editable();
      if (state && cell) {
        const record = cell as unknown as Record<string, unknown>;
        untracked(() =>
          this.syncControls(
            state.form,
            CELL_FIELDS,
            (f) =>
              record[f.key] ?? (f.key === 'status' ? 'Empty' : f.kind === 'number' ? null : ''),
            enabled,
          ),
        );
      }
    });

    effect(() => {
      const values = this.multiValues();
      const enabled = this.editable() && this.count() > 1;
      untracked(() =>
        this.syncControls(this.multiForm, MULTI_FIELDS, (f) => values[f.key], enabled),
      );
    });

    effect(() => {
      const state = this.creationState();
      const values = this.creationValues();
      if (state)
        untracked(() => this.syncControls(state.form, state.fields, (f) => values[f.key], true));
    });
  }

  // ---------------------------------------------------------------- template helpers

  protected isCollapsed(title: string): boolean {
    return this.collapsedSections().has(title);
  }

  protected toggleSection(title: string): void {
    this.collapsedSections.update((set) => {
      const next = new Set(set);
      if (!next.delete(title)) next.add(title);
      return next;
    });
  }

  protected readonly multiLayerOptions = computed<FieldOption[]>(() =>
    this.multiValues()['layerId']
      ? this.layerOptions()
      : [{ value: '', label: 'Mixed' }, ...this.layerOptions()],
  );

  protected creationHint(type: ObjectType): string {
    return OBJECT_DEFS[type].hint;
  }

  protected isHalf(f: FieldDef): boolean {
    return f.kind === 'number' || f.kind === 'readonly';
  }

  protected close(): void {
    if (this.creationType()) this.tools.setTool('select');
    else this.selection.clear();
  }

  protected align(mode: AlignMode): void {
    this.store.align(this.selection.ids(), mode);
  }

  protected distribute(axis: 'h' | 'v'): void {
    this.store.distribute(this.selection.ids(), axis);
  }

  /** Re-reads model values after a field loses focus (a focused field is never overwritten while typing). */
  protected resync(): void {
    setTimeout(() => {
      const state = this.singleState();
      const o = this.single();
      if (state && o)
        this.syncControls(
          state.form,
          state.fields,
          (f) => readField(o, f),
          this.editable() && !o.locked,
        );
    });
  }

  // ---------------------------------------------------------------- builders

  private buildSingle(o: WarehouseObject): FormState {
    const def = OBJECT_DEFS[o.type];
    const identity: FieldDef[] = [
      { key: 'name', label: o.type === 'text' ? 'Text' : `${def.label} name`, kind: 'text' },
      { key: def.idKey, label: `${def.label} ID`, kind: 'text' },
      { key: 'layerId', label: 'Layer', kind: 'select' },
    ];
    const position = (axis: 'x' | 'y', label: string, max: number): FieldDef => ({
      key: axis,
      label,
      kind: 'number',
      min: 0,
      max,
      suffix: 'px',
    });
    const geometry: FieldDef[] = [
      position('x', 'X position', WORLD_WIDTH),
      position('y', 'Y position', WORLD_HEIGHT),
      ...(def.customSize || o.type === 'rack'
        ? []
        : ([
            {
              key: 'width',
              label: def.sizeLabels[0],
              kind: 'number',
              min: 0.5,
              max: WORLD_WIDTH,
              suffix: 'px',
            },
            {
              key: 'height',
              label: def.sizeLabels[1],
              kind: 'number',
              min: 0.5,
              max: WORLD_HEIGHT,
              suffix: 'px',
            },
          ] as FieldDef[])),
      {
        key: 'rotation',
        label: 'Rotation',
        kind: 'number',
        min: -360,
        max: 360,
        suffix: '°',
        set: (_o, v) => ({ rotation: normalizeAngle(Number(v)) }),
      },
    ];
    const sections: Section[] = [];
    if (o.type === 'rack') {
      sections.push({ title: 'Level stock', kind: 'stock', fields: [] });
      sections.push({ title: 'Rack preview', kind: 'preview', fields: [] });
    }
    sections.push({ title: 'Identity', kind: 'fields', fields: identity });
    sections.push({ title: 'Position & size', kind: 'fields', fields: geometry });
    sections.push({ title: `${def.label} properties`, kind: 'fields', fields: def.fields });
    if (o.type === 'rack') {
      sections.push({ title: 'Cell configuration', kind: 'cell', fields: [] });
    }
    const fields = [...identity, ...geometry, ...def.fields];
    const form = this.buildForm(fields, (f) => readField(o, f));
    const state: FormState = { key: o.id, def, form, fields, sections };
    form.valueChanges.subscribe(() => this.applySingle(state));
    return state;
  }

  private buildCreation(type: ObjectType): FormState {
    const def = OBJECT_DEFS[type];
    const size: FieldDef[] =
      def.placement === 'line'
          ? [{ key: 'height', label: def.sizeLabels[1], kind: 'number', min: 0.5, max: 1000 }]
          : def.customSize
            ? []
            : [
                {
                  key: 'width',
                  label: `Default ${def.sizeLabels[0].toLowerCase()}`,
                  kind: 'number',
                  min: 1,
                  max: WORLD_WIDTH,
                },
                {
                  key: 'height',
                  label: `Default ${def.sizeLabels[1].toLowerCase()}`,
                  kind: 'number',
                  min: 1,
                  max: WORLD_HEIGHT,
                },
              ];
    const fields = [...def.fields.filter((f) => f.create), ...size];
    const config = this.tools.config(type);
    const form = this.buildForm(fields, (f) => config[f.key]);
    const state: FormState = { key: type, def, form, fields, sections: [] };
    form.valueChanges.subscribe(() => this.applyCreation(state, type));
    return state;
  }

  private buildCellForm(cell: RackCell): FormGroup<Controls> {
    const record = cell as unknown as Record<string, unknown>;
    const form = this.buildForm(
      CELL_FIELDS,
      (f) => record[f.key] ?? (f.key === 'status' ? 'Empty' : f.kind === 'number' ? null : ''),
    );
    form.valueChanges.subscribe(() => this.applyCell(cell.id, form));
    return form;
  }

  private buildForm(fields: FieldDef[], read: (f: FieldDef) => unknown): FormGroup<Controls> {
    const controls: Controls = {};
    for (const f of fields) if (f.kind !== 'readonly') controls[f.key] = new FormControl(read(f));
    return new FormGroup(controls);
  }

  /** Writes model values into controls without emitting, skipping the control the user is typing in. */
  private syncControls(
    form: FormGroup<Controls>,
    fields: FieldDef[],
    read: (f: FieldDef) => unknown,
    enabled: boolean,
  ): void {
    const active =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const focusedKey = active?.dataset?.['key'];
    for (const f of fields) {
      const control = form.controls[f.key];
      if (!control || (enabled && f.key === focusedKey && form.enabled)) continue;
      const value = read(f) ?? (f.kind === 'number' ? null : f.kind === 'toggle' ? false : '');
      if (control.value !== value) control.setValue(value, { emitEvent: false });
    }
    if (enabled !== form.enabled) {
      if (enabled) form.enable({ emitEvent: false });
      else form.disable({ emitEvent: false });
    }
  }

  // ---------------------------------------------------------------- writers

  private applySingle(state: FormState): void {
    const current = this.store.objectMap().get(state.key);
    if (!current || !state.form.enabled) return;
    const raw = state.form.getRawValue();
    let working = current;
    const patch: Patch = {};
    for (const f of state.fields) {
      if (!(f.key in raw)) continue;
      const value = coerceField(f, raw[f.key]);
      if (value === undefined || value === readField(working, f)) continue;
      if (f.key === state.def.idKey && !String(value).trim()) continue;
      const change = writeField(working, f, value);
      Object.assign(patch, change);
      working = { ...working, ...change } as WarehouseObject;
    }
    if (Object.keys(patch).length) this.store.update([[current.id, patch]], 'debounce');
  }

  private applyCreation(state: FormState, type: ObjectType): void {
    const raw = state.form.getRawValue();
    const config = this.tools.config(type);
    const patch: Patch = {};
    for (const f of state.fields) {
      const value = coerceField(f, raw[f.key]);
      if (value === undefined || value === config[f.key]) continue;
      // Real (non-virtual) setters may fan out, e.g. a space type also sets its colours.
      Object.assign(
        patch,
        f.set && !f.virtual
          ? f.set(config as unknown as WarehouseObject, value)
          : { [f.key]: value },
      );
    }
    if (Object.keys(patch).length) this.tools.patchConfig(type, patch);
  }

  private applyCell(cellId: string, form: FormGroup<Controls>): void {
    const rack = this.single();
    if (rack?.type !== 'rack' || !form.enabled) return;
    const raw = form.getRawValue();
    const capacity =
      raw['capacity'] === null || raw['capacity'] === ''
        ? undefined
        : Math.max(0, Number(raw['capacity']) || 0);
    this.store.updateCell(rack.id, cellId, {
      positionId: String(raw['positionId'] ?? '').trim() || this.cell()?.positionId || '',
      status: raw['status'],
      sku: String(raw['sku'] ?? '').trim() || undefined,
      capacity,
    });
  }

  private applyMulti(): void {
    if (!this.multiForm.enabled) return;
    const objects = this.store.selected().filter((o) => !this.store.isLocked(o));
    const bounds = this.store.selectionBounds();
    if (objects.length < 2 || !bounds) return;
    const raw = this.multiForm.getRawValue();
    const current = this.multiValues();
    const num = (key: string) =>
      raw[key] === null || raw[key] === '' || !Number.isFinite(Number(raw[key]))
        ? null
        : Number(raw[key]);
    const dx = num('x') !== null && num('x') !== current['x'] ? num('x')! - bounds.x : 0;
    const dy = num('y') !== null && num('y') !== current['y'] ? num('y')! - bounds.y : 0;
    const rotation =
      num('rotation') !== null && num('rotation') !== current['rotation']
        ? normalizeAngle(num('rotation')!)
        : null;
    const layerId =
      raw['layerId'] && raw['layerId'] !== current['layerId'] ? String(raw['layerId']) : null;
    if (!dx && !dy && rotation === null && !layerId) return;
    this.store.update(
      objects.map((o) => {
        const patch: Patch = {};
        if (dx) patch['x'] = o.x + dx;
        if (dy) patch['y'] = o.y + dy;
        if (rotation !== null) patch['rotation'] = rotation;
        if (layerId) patch['layerId'] = layerId;
        return [o.id, patch] as [string, Patch];
      }),
      'debounce',
    );
  }
}
