import { round } from '../../../core/utils/geometry';
import type { IconName } from '../../../shared/components/icon/icon.component';
import { RACK_TYPES } from './rack.model';
import { SPACE_TYPES } from './space.model';
import { ObjectType, WarehouseObject } from './warehouse-object.model';

export type FieldKind = 'text' | 'number' | 'select' | 'color' | 'toggle' | 'range' | 'readonly';

/**
 * Declarative description of one editable property.
 * The properties panel and the creation panel are both generated from these definitions.
 */
export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  /** Show this field in the creation panel as well as in the inspector. */
  create?: boolean;
  /** Derived field: it is not stored on the object, get/set translate it to real properties. */
  virtual?: boolean;
  get?: (o: WarehouseObject) => unknown;
  set?: (o: WarehouseObject, value: unknown) => Record<string, unknown>;
}

export interface ObjectTypeDef {
  type: ObjectType;
  label: string;
  icon: IconName;
  /** Prefix of generated business IDs, e.g. RACK-001. */
  prefix: string;
  /** Property that holds the business ID (rackId, wallId, ...). */
  idKey: string;
  layerId: string;
  /** How the object is drawn onto the canvas. */
  placement: 'rect' | 'line' | 'none';
  /** Default [width, height] in world units. */
  size: [number, number];
  sizeLabels: [string, string];
  /** Hide the generic width/height fields in the creation panel (the type supplies its own). */
  customSize?: boolean;
  defaults: Record<string, unknown>;
  fields: FieldDef[];
  hint: string;
}

const rec = (o: WarehouseObject) => o as unknown as Record<string, unknown>;
const color = (label = 'Color', key = 'color'): FieldDef => ({
  key,
  label,
  kind: 'color',
  create: true,
});
const opacity: FieldDef = {
  key: 'opacity',
  label: 'Opacity',
  kind: 'range',
  min: 0,
  max: 1,
  step: 0.05,
  create: true,
};
const DRAW_HINT = 'Click to place at the default size, or drag to draw a custom size.';

export const OBJECT_DEFS: Record<ObjectType, ObjectTypeDef> = {
  rack: {
    type: 'rack',
    label: 'Rack',
    icon: 'rack',
    prefix: 'RACK',
    idKey: 'rackId',
    layerId: 'racks',
    placement: 'rect',
    size: [120, 80],
    sizeLabels: ['Width', 'Height'],
    defaults: {
      rackType: 'Selective Pallet',
      rows: 5,
      columns: 10,
      cellWidth: 12,
      cellHeight: 16,
      levels: 5,
      bays: 10,
      rowSpacing: 0,
      columnSpacing: 0,
      color: '#2563EB',
      label: '',
      cells: [],
    },
    fields: [
      { key: 'rackType', label: 'Rack type', kind: 'select', options: RACK_TYPES },
      {
        key: 'columns',
        label: 'Number of bays',
        kind: 'number',
        min: 1,
        max: 100,
        step: 1,
        set: (_o, v) => ({ columns: v, bays: v }),
      },
      {
        key: 'levels',
        label: 'Levels per bay',
        kind: 'number',
        min: 1,
        max: 100,
        step: 1,
        set: (_o, v) => ({ levels: v, rows: v }),
      },
      {
        key: 'cellWidth',
        label: 'Cell width',
        kind: 'readonly',
        suffix: 'px',
      },
      {
        key: 'cellHeight',
        label: 'Cell height',
        kind: 'readonly',
        suffix: 'px',
      },
      {
        key: 'rowSpacing',
        label: 'Vertical gap',
        kind: 'readonly',
        suffix: 'px',
      },
      {
        key: 'columnSpacing',
        label: 'Horizontal gap',
        kind: 'readonly',
        suffix: 'px',
      },
      { key: 'label', label: 'Rack label', kind: 'text' },
      color('Rack color'),
    ],
    hint: 'Click to place the generated rack at its calculated pixel footprint.',
  },
  space: {
    type: 'space',
    label: 'Space',
    icon: 'space',
    prefix: 'SPC',
    idKey: 'spaceId',
    layerId: 'spaces',
    placement: 'rect',
    size: [300, 200],
    sizeLabels: ['Width', 'Height'],
    defaults: {
      spaceType: 'Storage Area',
      fillColor: '#DBEAFE',
      borderColor: '#2563EB',
      opacity: 0.55,
      labelVisible: true,
      cornerRadius: 0,
    },
    fields: [
      {
        key: 'spaceType',
        label: 'Space type',
        kind: 'select',
        options: SPACE_TYPES.map((s) => s.type),
        create: true,
        set: (_o, v) => {
          const preset = SPACE_TYPES.find((s) => s.type === v);
          return preset
            ? { spaceType: v, fillColor: preset.fill, borderColor: preset.border }
            : { spaceType: v };
        },
      },
      {
        key: 'area',
        label: 'Area',
        kind: 'readonly',
        virtual: true,
        get: (o) => `${round(o.width * o.height, 1).toLocaleString('en-US')} px²`,
      },
      color('Fill color', 'fillColor'),
      color('Border color', 'borderColor'),
      opacity,
      { key: 'cornerRadius', label: 'Corner radius', kind: 'number', min: 0, max: 500, step: 1 },
      { key: 'labelVisible', label: 'Show label', kind: 'toggle', create: true },
    ],
    hint: 'Drag across the canvas to draw the zone. A single click places it at the default size.',
  },
  aisle: {
    type: 'aisle',
    label: 'Aisle',
    icon: 'aisle',
    prefix: 'AISLE',
    idKey: 'aisleId',
    layerId: 'aisles',
    placement: 'rect',
    size: [400, 40],
    sizeLabels: ['Width', 'Height'],
    customSize: true,
    defaults: {
      direction: 'Horizontal',
      travelType: 'Two-way',
      travelDirection: 'Forward',
      color: '#FCD34D',
      aisleWidth: 40,
      aisleLength: 400,
    },
    fields: [
      {
        key: 'aisleWidth',
        label: 'Aisle width',
        kind: 'number',
        min: 1,
        max: 5000,
        create: true,
        virtual: true,
        get: (o) => (rec(o)['direction'] === 'Vertical' ? o.width : o.height),
        set: (o, v) => (rec(o)['direction'] === 'Vertical' ? { width: v } : { height: v }),
      },
      {
        key: 'aisleLength',
        label: 'Aisle length',
        kind: 'number',
        min: 1,
        max: 20000,
        create: true,
        virtual: true,
        get: (o) => (rec(o)['direction'] === 'Vertical' ? o.height : o.width),
        set: (o, v) => (rec(o)['direction'] === 'Vertical' ? { height: v } : { width: v }),
      },
      {
        key: 'direction',
        label: 'Direction',
        kind: 'select',
        options: ['Horizontal', 'Vertical'],
        create: true,
        // Switching direction turns the aisle around its centre.
        set: (o, v) =>
          v === rec(o)['direction']
            ? {}
            : {
                direction: v,
                width: o.height,
                height: o.width,
                x: o.x + o.width / 2 - o.height / 2,
                y: o.y + o.height / 2 - o.width / 2,
              },
      },
      {
        key: 'startPoint',
        label: 'Start (X, Y)',
        kind: 'readonly',
        virtual: true,
        get: (o) => {
          const vertical = rec(o)['direction'] === 'Vertical';
          return `${round(vertical ? o.x + o.width / 2 : o.x, 1)}, ${round(vertical ? o.y : o.y + o.height / 2, 1)} px`;
        },
      },
      {
        key: 'endPoint',
        label: 'End (X, Y)',
        kind: 'readonly',
        virtual: true,
        get: (o) => {
          const vertical = rec(o)['direction'] === 'Vertical';
          return `${round(vertical ? o.x + o.width / 2 : o.x + o.width, 1)}, ${round(vertical ? o.y + o.height : o.y + o.height / 2, 1)} px`;
        },
      },
      {
        key: 'travelType',
        label: 'Travel type',
        kind: 'select',
        options: ['One-way', 'Two-way'],
        create: true,
      },
      {
        key: 'travelDirection',
        label: 'Travel direction',
        kind: 'select',
        options: ['Forward', 'Reverse'],
        create: true,
      },
      color('Aisle color'),
    ],
    hint: 'Drag to draw the aisle; its direction follows the longer side. A single click places the configured size.',
  },
  text: {
    type: 'text',
    label: 'Text',
    icon: 'text',
    prefix: 'TXT',
    idKey: 'elementId',
    layerId: 'labels',
    placement: 'rect',
    size: [160, 24],
    sizeLabels: ['Width', 'Height'],
    defaults: { fontSize: 14, color: '#111827', bold: false },
    fields: [
      {
        key: 'fontSize',
        label: 'Font size',
        kind: 'number',
        min: 2,
        max: 2000,
        step: 1,
        create: true,
      },
      { key: 'bold', label: 'Bold', kind: 'toggle', create: true },
      color('Text color'),
    ],
    hint: 'Click to drop a label, then type its text in the Name field of the inspector.',
  },
  shape: {
    type: 'shape',
    label: 'Shape',
    icon: 'shape',
    prefix: 'SHP',
    idKey: 'elementId',
    layerId: 'labels',
    placement: 'rect',
    size: [120, 80],
    sizeLabels: ['Width', 'Height'],
    defaults: {
      shapeKind: 'Rectangle',
      fillColor: '#F1F5F9',
      borderColor: '#64748B',
      borderWidth: 1.5,
      opacity: 1,
    },
    fields: [
      {
        key: 'shapeKind',
        label: 'Shape',
        kind: 'select',
        options: ['Rectangle', 'Circle', 'Triangle'],
        create: true,
      },
      color('Fill color', 'fillColor'),
      color('Border color', 'borderColor'),
      {
        key: 'borderWidth',
        label: 'Border width',
        kind: 'number',
        min: 0,
        max: 20,
        step: 0.5,
        create: true,
      },
      opacity,
    ],
    hint: DRAW_HINT,
  },
  image: {
    type: 'image',
    label: 'Floor Plan',
    icon: 'image',
    prefix: 'IMG',
    idKey: 'elementId',
    layerId: 'floorplan',
    placement: 'none',
    size: [800, 600],
    sizeLabels: ['Width', 'Height'],
    defaults: { src: '', opacity: 0.6 },
    fields: [opacity],
    hint: '',
  },
};

export function readField(o: WarehouseObject, f: FieldDef): unknown {
  const v = f.get ? f.get(o) : rec(o)[f.key];
  return typeof v === 'number' ? round(v, 2) : v;
}

/** Turns an edited field value into a patch for the object. */
export function writeField(
  o: WarehouseObject,
  f: FieldDef,
  value: unknown,
): Record<string, unknown> {
  return f.set ? f.set(o, value) : { [f.key]: value };
}

/** Coerces a raw form value to the field's type. Returns undefined when the value is not usable yet. */
export function coerceField(f: FieldDef, raw: unknown): unknown {
  if (f.kind === 'number' || f.kind === 'range') {
    if (raw === null || raw === '' || raw === undefined) return undefined;
    let n = Number(raw);
    if (!Number.isFinite(n)) return undefined;
    if (f.min !== undefined) n = Math.max(f.min, n);
    if (f.max !== undefined) n = Math.min(f.max, n);
    return f.step === 1 ? Math.round(n) : n;
  }
  if (f.kind === 'toggle') return !!raw;
  return raw ?? '';
}
