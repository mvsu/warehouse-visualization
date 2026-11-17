import { Injectable } from '@angular/core';
import { LayoutSummary, WarehouseLayout } from '../../features/warehouse/models/warehouse.model';

const DB_NAME = 'warehouse-designer';
const STORE = 'layouts';
const LS_PREFIX = 'wd:layout:';
const LAST_OPENED_KEY = 'wd:lastLayoutId';

/**
 * Browser persistence for warehouse layouts.
 * IndexedDB is the primary store (floor-plan images can be large); localStorage is the fallback
 * when IndexedDB is unavailable. Swap this service for an HTTP-backed one to persist on a server.
 */
@Injectable({ providedIn: 'root' })
export class WarehouseStorageService {
  private db: Promise<IDBDatabase | null> | null = null;

  async list(): Promise<LayoutSummary[]> {
    const layouts = await this.all();
    return layouts
      .map((l) => ({ id: l.id, name: l.name, updatedAt: l.updatedAt, objectCount: l.objects?.length ?? 0 }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<WarehouseLayout | null> {
    const db = await this.open();
    if (!db) return this.lsGet(id);
    return this.request<WarehouseLayout | undefined>(db, 'readonly', (s) => s.get(id)).then((v) => v ?? null);
  }

  async save(layout: WarehouseLayout): Promise<void> {
    const db = await this.open();
    if (!db) {
      localStorage.setItem(LS_PREFIX + layout.id, JSON.stringify(layout));
      return;
    }
    await this.request(db, 'readwrite', (s) => s.put(layout));
  }

  async delete(id: string): Promise<void> {
    const db = await this.open();
    if (!db) {
      localStorage.removeItem(LS_PREFIX + id);
      return;
    }
    await this.request(db, 'readwrite', (s) => s.delete(id));
  }

  getLastOpenedId(): string | null {
    try {
      return localStorage.getItem(LAST_OPENED_KEY);
    } catch {
      return null;
    }
  }

  setLastOpenedId(id: string): void {
    try {
      localStorage.setItem(LAST_OPENED_KEY, id);
    } catch {
      /* storage unavailable: the app simply opens the most recent layout next time */
    }
  }

  private async all(): Promise<WarehouseLayout[]> {
    const db = await this.open();
    if (db) return this.request<WarehouseLayout[]>(db, 'readonly', (s) => s.getAll());
    const layouts: WarehouseLayout[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(LS_PREFIX)) {
          const layout = this.lsGet(key.slice(LS_PREFIX.length));
          if (layout) layouts.push(layout);
        }
      }
    } catch {
      /* no storage at all: layouts live in memory for this session only */
    }
    return layouts;
  }

  private lsGet(id: string): WarehouseLayout | null {
    try {
      const raw = localStorage.getItem(LS_PREFIX + id);
      return raw ? (JSON.parse(raw) as WarehouseLayout) : null;
    } catch {
      return null;
    }
  }

  private open(): Promise<IDBDatabase | null> {
    this.db ??= new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.db;
  }

  private request<R>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as R);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}
