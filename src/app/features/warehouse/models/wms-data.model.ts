/** Item master record. Quantities are always read from the rack levels, never stored here. */
export interface WmsItem {
  sku: string;
  name: string;
  uom?: string;
  category?: string;
}

export interface WmsPickLine {
  sku: string;
  name?: string;
  quantity: number;
  uom?: string;
  /** Location code of the bay level to pick from (RackCell.locationCode). */
  locationCode: string;
  picked?: boolean;
}

export interface WmsPickup {
  id: string;
  orderNo?: string;
  customer?: string;
  status: string;
  priority?: string;
  dueOn?: string;
  assignedTo?: string;
  lines: WmsPickLine[];
}

export interface WmsActivity {
  id: string;
  time: string;
  /** Receipt, Put-away, Pick, Transfer, Cycle Count ... */
  type: string;
  sku: string;
  name?: string;
  quantity: number;
  uom?: string;
  locationCode: string;
  /** Source level for transfers. */
  fromLocationCode?: string;
  user?: string;
  reference?: string;
}

/** Operational data shown in view mode. It travels with the layout JSON under the "wms" key. */
export interface WmsData {
  items?: WmsItem[];
  pickups?: WmsPickup[];
  activity?: WmsActivity[];
}
