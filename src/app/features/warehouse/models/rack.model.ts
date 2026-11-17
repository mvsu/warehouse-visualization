import { WarehouseObject } from './warehouse-object.model';

export const RACK_TYPES = [
  'Selective Pallet',
  'Drive-In',
  'Push-Back',
  'Pallet Flow',
  'Cantilever',
  'Shelving',
  'Mezzanine',
] as const;
export const CELL_STATUSES = [
  'Empty',
  'In Stock',
  'Low Stock',
  'Occupied',
  'Reserved',
  'Blocked',
] as const;
export type CellStatus = (typeof CELL_STATUSES)[number];

export const MAX_RACK_ROWS = 100;
export const MAX_RACK_COLUMNS = 100;

/** One stock line stored in a rack cell (a bay level). */
export interface CellItem {
  sku: string;
  name: string;
  quantity: number;
  uom?: string;
  minQuantity?: number;
  batch?: string;
  grnNo?: string;
  receivedOn?: string;
}

/** Canvas and panel colours of the stock statuses. */
export const STOCK_COLORS: Record<string, string> = {
  'In Stock': '#22C55E',
  'Low Stock': '#F59E0B',
  Empty: '#E2E8F0',
};

export interface RackCell {
  id: string;
  rackId: string;
  row: number;
  column: number;
  positionId: string;
  width: number;
  height: number;
  /** Pixel coordinates relative to the rack's unrotated top-left corner. */
  x: number;
  y: number;
  status?: CellStatus;
  sku?: string;
  capacity?: number;
  /** Full WMS location code, e.g. GF-A-STA-A1-B03-L2. */
  locationCode?: string;
  /** Total quantity held in this bay level. */
  quantity?: number;
  /** Stock lines held in this bay level. */
  items?: CellItem[];
}

export interface Rack extends WarehouseObject {
  type: 'rack';
  rackId: string;
  rackType: string;
  rows: number;
  columns: number;
  /** Fixed dimensions of every cell in warehouse world pixels. */
  cellWidth: number;
  cellHeight: number;
  levels: number;
  bays: number;
  rowSpacing: number;
  columnSpacing: number;
  color: string;
  label: string;
  cells: RackCell[];
}

/** Values collected by the rack creation dialog before the rack is placed. */
export interface RackConfig {
  name: string;
  rackId: string;
  rackType: string;
  rows: number;
  columns: number;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  levels: number;
  bays: number;
  rowSpacing: number;
  columnSpacing: number;
  orientation: 'Horizontal' | 'Vertical';
  color: string;
  label: string;
  /** Optional zone / area the rack belongs to (codes of the spaces on the canvas). */
  zoneCode?: string;
  areaCode?: string;
}
