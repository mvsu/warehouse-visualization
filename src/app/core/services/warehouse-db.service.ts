import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  DbActivity,
  DbAisle,
  DbArea,
  DbItem,
  DbLayoutTables,
  DbLocation,
  DbObject,
  DbPickup,
  DbPickupLine,
  DbRack,
  DbSnapshot,
  DbStock,
  DbWarehouse,
  DbZone,
} from '../../features/warehouse/data/db.model';
import { API_BASE_URL, USE_MOCK_API } from './warehouse-api.service';

/** Warehouse opened on start. Replace with the id chosen by the user / route when there are several. */
export const DEFAULT_WAREHOUSE_ID = 'WH-CHN-01';

const MOCK_DB_URL = 'mock/db';

/**
 * Reads and writes the warehouse tables.
 *
 * Mock mode (USE_MOCK_API = true): every table is a JSON file, public/mock/db/<table>.json.
 * Real mode (USE_MOCK_API = false): the same table names are REST resources,
 *   GET  /api/wms/warehouses                      -> DbWarehouse[]
 *   GET  /api/wms/warehouses/:id/<table>          -> rows of that table for the warehouse
 *   PUT  /api/wms/warehouses/:id/<table>          -> replace the rows (racks, locations, aisles, objects)
 * The file name, the URL segment and the DbSnapshot key are the same word, so nothing else changes.
 */
@Injectable({ providedIn: 'root' })
export class WarehouseDbService {
  private readonly http = inject(HttpClient);

  /** Loads every table of one warehouse. */
  async load(warehouseId: string): Promise<DbSnapshot> {
    const warehouses = await this.get<DbWarehouse>('warehouses', null);
    const warehouse = warehouses.find((w) => w.warehouseId === warehouseId) ?? warehouses[0];
    if (!warehouse) throw new Error(`Warehouse ${warehouseId} was not found.`);
    const id = warehouse.warehouseId;
    const [zones, areas, racks, locations, stock, items, aisles, objects, pickups, pickupLines, activity] =
      await Promise.all([
        this.get<DbZone>('zones', id),
        this.get<DbArea>('areas', id),
        this.get<DbRack>('racks', id),
        this.get<DbLocation>('locations', id),
        this.get<DbStock>('stock', id),
        this.get<DbItem>('items', id),
        this.get<DbAisle>('aisles', id),
        this.get<DbObject>('objects', id),
        this.get<DbPickup>('pickups', id),
        this.get<DbPickupLine>('pickup-lines', id),
        this.get<DbActivity>('activity', id),
      ]);
    return {
      warehouse,
      zones,
      areas,
      racks,
      locations,
      stock,
      items,
      aisles,
      objects,
      pickups,
      pickupLines,
      activity,
    };
  }

  /** Saves what the editor can change: racks, their locations, aisles and objects. */
  async save(warehouseId: string, tables: DbLayoutTables): Promise<void> {
    // The mock database is a set of static files; the browser copy of the layout keeps the edits.
    if (USE_MOCK_API) return;
    const base = `${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}`;
    await Promise.all([
      firstValueFrom(this.http.put(`${base}/racks`, tables.racks)),
      firstValueFrom(this.http.put(`${base}/locations`, tables.locations)),
      firstValueFrom(this.http.put(`${base}/aisles`, tables.aisles)),
      firstValueFrom(this.http.put(`${base}/objects`, tables.objects)),
    ]);
  }

  private async get<T>(table: string, warehouseId: string | null): Promise<T[]> {
    if (USE_MOCK_API) {
      const rows = await firstValueFrom(this.http.get<T[]>(`${MOCK_DB_URL}/${table}.json`));
      // Files hold every warehouse; rows without a warehouseId column (locations, stock, items) are shared.
      return warehouseId
        ? rows.filter((row) => {
            const owner = (row as { warehouseId?: string }).warehouseId;
            return !owner || owner === warehouseId;
          })
        : rows;
    }
    const url = warehouseId
      ? `${API_BASE_URL}/warehouses/${encodeURIComponent(warehouseId)}/${table}`
      : `${API_BASE_URL}/${table}`;
    return firstValueFrom(this.http.get<T[]>(url));
  }
}
