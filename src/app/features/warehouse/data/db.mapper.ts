import { WarehouseLayout } from '../models/warehouse.model';
import { WmsData } from '../models/wms-data.model';
import {
  DbAisle,
  DbLayoutTables,
  DbLocation,
  DbObject,
  DbObjectType,
  DbRack,
  DbSnapshot,
} from './db.model';

type Row = Record<string, unknown>;

const pad2 = (n: number) => String(n).padStart(2, '0');
const SHAPE_KIND: Record<string, string> = {
  rectangle: 'Rectangle',
  circle: 'Circle',
  triangle: 'Triangle',
};
const OBJECT_TYPE: Record<string, DbObjectType> = {
  Rectangle: 'rectangle',
  Circle: 'circle',
  Ellipse: 'circle',
  Triangle: 'triangle',
};

/** Stable id of the layout that mirrors a warehouse in the database. */
export const dbLayoutId = (warehouseId: string) => `db:${warehouseId}`;
export const isDbLayout = (layoutId: string) => layoutId.startsWith('db:');
export const dbWarehouseId = (layoutId: string) => layoutId.slice(3);

/** Location id of a bay level that has none yet (a rack drawn in the editor). */
export const locationIdFor = (rackId: string, bay: number, level: number) =>
  `${rackId}-B${pad2(bay)}-L${level}`;

/** Database rows -> the layout the canvas works with. */
export function layoutFromDb(db: DbSnapshot): Partial<WarehouseLayout> {
  const itemBySku = new Map(db.items.map((i) => [i.sku, i]));
  const stockByLocation = new Map<string, Row[]>();
  for (const s of db.stock) {
    const item = itemBySku.get(s.sku);
    const line: Row = {
      sku: s.sku,
      name: item?.name ?? s.sku,
      quantity: s.quantity,
      uom: item?.uom,
      minQuantity: s.minQuantity,
      batch: s.batch,
      grnNo: s.grnNo,
      receivedOn: s.receivedOn,
      stockId: s.stockId,
    };
    const list = stockByLocation.get(s.locationId);
    if (list) list.push(line);
    else stockByLocation.set(s.locationId, [line]);
  }
  const locationsByRack = new Map<string, DbLocation[]>();
  for (const l of db.locations) {
    const list = locationsByRack.get(l.rackId);
    if (list) list.push(l);
    else locationsByRack.set(l.rackId, [l]);
  }

  const objects: Row[] = [];
  for (const z of db.zones)
    objects.push({
      id: z.zoneId,
      spaceId: z.zoneId,
      type: 'space',
      name: z.name,
      x: z.x,
      y: z.y,
      width: z.width,
      height: z.height,
      spaceType: 'Empty Space',
      fillColor: '#F8FAFC',
      borderColor: '#94A3B8',
      opacity: 0.9,
      labelVisible: false,
      properties: { kind: 'zone', code: z.code },
    });
  for (const a of db.areas)
    objects.push({
      id: a.areaId,
      spaceId: a.areaId,
      type: 'space',
      name: a.name,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      spaceType: a.areaType,
      ...(a.fillColor ? { fillColor: a.fillColor } : {}),
      ...(a.borderColor ? { borderColor: a.borderColor } : {}),
      labelVisible: a.showLabel !== false,
      properties: { kind: 'area', code: a.code, zoneCode: a.zoneCode },
    });
  for (const a of db.aisles)
    objects.push({
      id: a.aisleId,
      aisleId: a.aisleId,
      type: 'aisle',
      name: a.name,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      direction: a.direction,
      travelType: a.travelType,
      travelDirection: a.travelDirection,
      color: a.color,
    });
  for (const r of db.racks)
    objects.push({
      id: r.rackId,
      rackId: r.rackId,
      type: 'rack',
      name: r.name,
      x: r.x,
      y: r.y,
      rotation: r.rotation,
      width: r.bays * r.cellWidth,
      height: r.levels * r.cellHeight,
      rackType: r.rackType,
      rows: r.levels,
      columns: r.bays,
      levels: r.levels,
      bays: r.bays,
      cellWidth: r.cellWidth,
      cellHeight: r.cellHeight,
      rowSpacing: 0,
      columnSpacing: 0,
      color: r.color,
      label: r.label ?? '',
      properties: { zoneCode: r.zoneCode, areaCode: r.areaCode },
      cells: (locationsByRack.get(r.rackId) ?? []).map((l) => {
        const items = stockByLocation.get(l.locationId) ?? [];
        return {
          row: l.level,
          column: l.bay,
          positionId: l.positionId,
          locationCode: l.locationId,
          capacity: l.capacity,
          status: l.status,
          quantity: items.reduce((sum, i) => sum + (Number(i['quantity']) || 0), 0),
          sku: items[0]?.['sku'],
          items,
        };
      }),
    });
  for (const o of db.objects) {
    const base: Row = {
      id: o.objectId,
      elementId: o.objectId,
      name: o.name,
      x: o.x,
      y: o.y,
      width: o.width,
      height: o.height,
      rotation: o.rotation,
      locked: !!o.locked,
      ...(o.layerId ? { layerId: o.layerId } : {}),
    };
    if (o.objectType === 'text')
      objects.push({
        ...base,
        type: 'text',
        fontSize: o.fontSize ?? 14,
        bold: !!o.bold,
        color: o.color ?? '#111827',
      });
    else
      objects.push({
        ...base,
        type: 'shape',
        shapeKind: SHAPE_KIND[o.objectType] ?? 'Rectangle',
        fillColor: o.fillColor ?? '#F1F5F9',
        borderColor: o.borderColor ?? '#64748B',
        borderWidth: o.borderWidth ?? 1.5,
        opacity: o.opacity ?? 1,
      });
  }

  const linesByPickup = new Map<string, DbSnapshot['pickupLines']>();
  for (const line of db.pickupLines) {
    const list = linesByPickup.get(line.pickupId);
    if (list) list.push(line);
    else linesByPickup.set(line.pickupId, [line]);
  }
  const wms: WmsData = {
    items: db.items,
    pickups: db.pickups.map((p) => ({
      id: p.pickupId,
      orderNo: p.orderNo,
      customer: p.customer,
      status: p.status,
      priority: p.priority,
      dueOn: p.dueOn,
      assignedTo: p.assignedTo,
      lines: (linesByPickup.get(p.pickupId) ?? []).map((l) => ({
        sku: l.sku,
        name: itemBySku.get(l.sku)?.name,
        quantity: l.quantity,
        uom: itemBySku.get(l.sku)?.uom,
        locationCode: l.locationId,
        picked: l.picked,
      })),
    })),
    activity: db.activity.map((a) => ({
      id: a.activityId,
      time: a.time,
      type: a.type,
      sku: a.sku,
      name: itemBySku.get(a.sku)?.name,
      quantity: a.quantity,
      uom: itemBySku.get(a.sku)?.uom,
      locationCode: a.locationId,
      fromLocationCode: a.fromLocationId,
      user: a.user,
      reference: a.reference,
    })),
  };

  const w = db.warehouse;
  return {
    id: dbLayoutId(w.warehouseId),
    name: w.floorName ? `${w.name} - ${w.floorName}` : w.name,
    width: w.canvasWidth,
    height: w.canvasHeight,
    objects: objects as unknown as WarehouseLayout['objects'],
    grid: {
      cellWidth: w.gridCellWidth,
      cellHeight: w.gridCellHeight,
      warehouseWidth: w.canvasWidth,
      warehouseHeight: w.canvasHeight,
      visible: true,
      snap: true,
    },
    view: { zoom: 1, offsetX: 0, offsetY: 0 },
    wms,
  };
}

/** The canvas layout -> the rows the editor saves: racks, their locations, aisles and objects. */
export function layoutToDb(layout: WarehouseLayout, warehouseId: string): DbLayoutTables {
  const racks: DbRack[] = [];
  const locations: DbLocation[] = [];
  const aisles: DbAisle[] = [];
  const objects: DbObject[] = [];
  for (const object of layout.objects) {
    const o = object as unknown as Row & {
      id: string;
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      locked: boolean;
      layerId: string;
    };
    const properties = (o['properties'] ?? {}) as Row;
    switch (object.type) {
      case 'rack': {
        const rackId = String(o['rackId'] || o.id);
        racks.push({
          rackId,
          warehouseId,
          name: o.name,
          rackType: String(o['rackType'] ?? ''),
          zoneCode: properties['zoneCode'] as string | undefined,
          areaCode: properties['areaCode'] as string | undefined,
          x: o.x,
          y: o.y,
          rotation: o.rotation,
          bays: Number(o['columns']),
          levels: Number(o['rows']),
          cellWidth: Number(o['cellWidth']),
          cellHeight: Number(o['cellHeight']),
          color: String(o['color'] ?? ''),
          label: String(o['label'] ?? ''),
        });
        for (const cell of (o['cells'] ?? []) as Row[]) {
          const bay = Number(cell['column']);
          const level = Number(cell['row']);
          locations.push({
            locationId: String(cell['locationCode'] || locationIdFor(rackId, bay, level)),
            rackId,
            bay,
            level,
            positionId: String(cell['positionId'] ?? ''),
            capacity: cell['capacity'] as number | undefined,
            status: String(cell['status'] ?? 'Empty'),
          });
        }
        break;
      }
      case 'aisle':
        aisles.push({
          aisleId: String(o['aisleId'] || o.id),
          warehouseId,
          name: o.name,
          x: o.x,
          y: o.y,
          width: o.width,
          height: o.height,
          direction: o['direction'] as DbAisle['direction'],
          travelType: String(o['travelType'] ?? ''),
          travelDirection: String(o['travelDirection'] ?? ''),
          color: String(o['color'] ?? ''),
        });
        break;
      case 'shape':
      case 'text': {
        const base = {
          objectId: String(o['elementId'] || o.id),
          warehouseId,
          name: o.name,
          x: o.x,
          y: o.y,
          width: o.width,
          height: o.height,
          rotation: o.rotation,
          layerId: o.layerId,
          locked: !!o.locked,
        };
        if (object.type === 'text')
          objects.push({
            ...base,
            objectType: 'text',
            fontSize: Number(o['fontSize']),
            bold: !!o['bold'],
            color: String(o['color'] ?? ''),
          });
        else
          objects.push({
            ...base,
            objectType: OBJECT_TYPE[String(o['shapeKind'])] ?? 'rectangle',
            fillColor: String(o['fillColor'] ?? ''),
            borderColor: String(o['borderColor'] ?? ''),
            borderWidth: Number(o['borderWidth']),
            opacity: Number(o['opacity']),
          });
        break;
      }
      // Zones and areas are WMS master data; every other type is not part of the simplified editor.
    }
  }
  return { racks, locations, aisles, objects };
}
