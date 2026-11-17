import { OBJECT_DEFS } from './object-schema';
import { ObjectType, WarehouseObject } from './warehouse-object.model';

const rec = (o: WarehouseObject) => o as unknown as Record<string, unknown>;

/** Every identifier already used by the given objects (internal ids and business IDs). */
export function takenCodes(objects: WarehouseObject[]): Set<string> {
  const taken = new Set<string>();
  for (const o of objects) {
    taken.add(o.id);
    const code = rec(o)[OBJECT_DEFS[o.type].idKey];
    if (typeof code === 'string') taken.add(code);
  }
  return taken;
}

/** Next free code for a prefix, e.g. RACK-007. The code is added to `taken`. */
export function nextCode(prefix: string, taken: Set<string>): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const code of taken) {
    const m = pattern.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const code = `${prefix}-${String(max + 1).padStart(3, '0')}`;
  taken.add(code);
  return code;
}

/**
 * Creates a fully-populated object of the given type.
 * `overrides` may contain geometry, any type-specific property and creation-only (virtual) values.
 */
export function createObject(type: ObjectType, taken: Set<string>, overrides: Record<string, unknown> = {}): WarehouseObject {
  const def = OBJECT_DEFS[type];
  const id = nextCode(def.prefix, taken);
  const values: Record<string, unknown> = { ...def.defaults, ...overrides };
  for (const f of def.fields) if (f.virtual) delete values[f.key];
  if (!values['name']) delete values['name'];
  if (!values[def.idKey]) delete values[def.idKey];
  const obj = {
    id,
    type,
    name: `${def.label} ${Number(id.split('-').pop())}`,
    x: 0,
    y: 0,
    width: def.size[0],
    height: def.size[1],
    rotation: 0,
    visible: true,
    locked: false,
    layerId: def.layerId,
    properties: {},
    [def.idKey]: id,
    ...values,
  };
  return obj as WarehouseObject;
}
