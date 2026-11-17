import { WmsItem } from '../models/wms-data.model';

/**
 * Database row shapes. One interface per table; one JSON file per table under public/mock/db.
 * Primary keys end in "Id"; a column named like another table's key is a foreign key to it.
 */
export interface DbWarehouse {
  warehouseId: string;
  name: string;
  site?: string;
  floorId?: string;
  floorName?: string;
  canvasWidth: number;
  canvasHeight: number;
  gridCellWidth: number;
  gridCellHeight: number;
}

/** WMS master data: drawn on the canvas, not editable from the toolbar. */
export interface DbZone {
  zoneId: string;
  warehouseId: string;
  code: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** WMS master data: drawn on the canvas, not editable from the toolbar. */
export interface DbArea {
  areaId: string;
  warehouseId: string;
  zoneCode?: string;
  code: string;
  name: string;
  areaType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
  borderColor?: string;
  showLabel?: boolean;
}

export interface DbRack {
  rackId: string;
  warehouseId: string;
  name: string;
  rackType: string;
  zoneCode?: string;
  areaCode?: string;
  x: number;
  y: number;
  rotation: number;
  bays: number;
  levels: number;
  cellWidth: number;
  cellHeight: number;
  color: string;
  label?: string;
}

/** One bay level of a rack. */
export interface DbLocation {
  locationId: string;
  rackId: string;
  bay: number;
  level: number;
  positionId: string;
  capacity?: number;
  status: string;
}

/** One item line stored in a location. */
export interface DbStock {
  stockId: string;
  locationId: string;
  sku: string;
  quantity: number;
  minQuantity?: number;
  batch?: string;
  grnNo?: string;
  receivedOn?: string;
}

export type DbItem = WmsItem;

export interface DbAisle {
  aisleId: string;
  warehouseId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  direction: 'Horizontal' | 'Vertical';
  travelType: string;
  travelDirection: string;
  color: string;
}

export type DbObjectType = 'rectangle' | 'circle' | 'triangle' | 'text';

/** Free objects: rectangle, circle, triangle and text. For text, `name` is the text itself. */
export interface DbObject {
  objectId: string;
  warehouseId: string;
  objectType: DbObjectType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  layerId?: string;
  locked?: boolean;
  // shapes
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
  // text
  fontSize?: number;
  bold?: boolean;
  color?: string;
}

export interface DbPickup {
  pickupId: string;
  warehouseId: string;
  orderNo?: string;
  customer?: string;
  status: string;
  priority?: string;
  dueOn?: string;
  assignedTo?: string;
}

export interface DbPickupLine {
  lineId: string;
  pickupId: string;
  sku: string;
  quantity: number;
  locationId: string;
  picked?: boolean;
}

export interface DbActivity {
  activityId: string;
  warehouseId: string;
  time: string;
  type: string;
  sku: string;
  quantity: number;
  locationId: string;
  fromLocationId?: string;
  user?: string;
  reference?: string;
}

/** Everything one warehouse needs, table by table. */
export interface DbSnapshot {
  warehouse: DbWarehouse;
  zones: DbZone[];
  areas: DbArea[];
  racks: DbRack[];
  locations: DbLocation[];
  stock: DbStock[];
  items: DbItem[];
  aisles: DbAisle[];
  objects: DbObject[];
  pickups: DbPickup[];
  pickupLines: DbPickupLine[];
  activity: DbActivity[];
}

/** The tables the editor writes back. Stock, items, pick lists and activity belong to the WMS. */
export type DbLayoutTables = Pick<DbSnapshot, 'racks' | 'locations' | 'aisles' | 'objects'>;
