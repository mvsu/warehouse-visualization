import { WarehouseLayer, WarehouseObject } from './warehouse-object.model';
import { WmsData } from './wms-data.model';

/** Maximum pixel-addressable warehouse world. The base grid is exactly 1 × 1 px. */
export const WORLD_WIDTH = 24_400;
export const WORLD_HEIGHT = 20_000;
export const DEFAULT_WAREHOUSE_WIDTH = 2_000;
export const DEFAULT_WAREHOUSE_HEIGHT = 2_000;
export const LAYOUT_SCHEMA_VERSION = 3;

export interface WarehouseGridSettings {
  cellWidth: number;
  cellHeight: number;
  warehouseWidth: number;
  warehouseHeight: number;
  visible: boolean;
  snap: boolean;
}

export const defaultGridSettings = (): WarehouseGridSettings => ({
  cellWidth: 100,
  cellHeight: 100,
  warehouseWidth: WORLD_WIDTH,
  warehouseHeight: WORLD_HEIGHT,
  visible: true,
  snap: true,
});

export interface LayoutViewState {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface WarehouseLayout {
  id: string;
  name: string;
  width: number;
  height: number;
  objects: WarehouseObject[];
  layers: WarehouseLayer[];
  updatedAt: string;
  createdAt?: string;
  schemaVersion?: number;
  view?: LayoutViewState;
  grid?: WarehouseGridSettings;
  /** Items, pick lists and activity shown in view mode. */
  wms?: WmsData;
}

export interface LayoutSummary {
  id: string;
  name: string;
  updatedAt: string;
  objectCount: number;
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

/** Bottom-to-top drawing order. */
export function defaultLayers(): WarehouseLayer[] {
  return [
    ['floorplan', 'Floor Plan'],
    ['spaces', 'Spaces'],
    ['aisles', 'Aisles'],
    ['walls', 'Walls'],
    ['racks', 'Racks'],
    ['labels', 'Objects'],
  ].map(([id, name]) => ({ id, name, visible: true, locked: false }));
}
