import { Injectable, computed, inject, signal } from '@angular/core';
import { RenderFocus } from '../../../core/services/canvas-renderer.service';
import { Rack, RackCell } from '../models/rack.model';
import { Space } from '../models/space.model';
import { WarehouseObject } from '../models/warehouse-object.model';
import { WmsActivity, WmsPickup } from '../models/wms-data.model';
import { ObjectSelectionService } from './object-selection.service';
import { WarehouseService } from './warehouse.service';

export type ViewTab = 'items' | 'pickup' | 'activity';

export interface RackInfo {
  rack: Rack;
  zone: Space | null;
  area: Space | null;
}

export interface ItemRow {
  sku: string;
  name: string;
  uom: string;
  category: string;
  quantity: number;
  locations: number;
  lowLocations: number;
}

/** One bay level together with the quantity that is relevant for the current list. */
export interface CellRef {
  rack: Rack;
  cell: RackCell;
  quantity: number;
}

export interface StockSummary {
  racks: number;
  levels: number;
  inStock: number;
  lowStock: number;
  empty: number;
}

const centreInside = (o: WarehouseObject, box: WarehouseObject): boolean => {
  const x = o.x + o.width / 2;
  const y = o.y + o.height / 2;
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
};
const isZone = (space: Space): boolean => space.properties?.['kind'] === 'zone';
const coded = (space: Space, code: unknown): boolean =>
  !!code && space.properties?.['code'] === code;

/**
 * State of the read-only view mode: the Items / Pickup / Activity tab, the zone / area / rack
 * filters and what they highlight or fade on the canvas. Everything is derived from the layout
 * (racks, spaces and the "wms" block of the JSON).
 */
@Injectable({ providedIn: 'root' })
export class ViewModeService {
  private readonly store = inject(WarehouseService);
  private readonly selection = inject(ObjectSelectionService);

  readonly tab = signal<ViewTab | null>(null);
  readonly search = signal('');
  readonly zoneId = signal('');
  readonly areaId = signal('');
  readonly rackId = signal('');
  readonly selectedSku = signal<string | null>(null);
  readonly selectedPickupId = signal<string | null>(null);
  readonly selectedActivityId = signal<string | null>(null);

  private readonly spaces = computed(() =>
    this.store.objects().filter((o): o is Space => o.type === 'space'),
  );
  readonly zones = computed(() => this.spaces().filter(isZone));
  readonly areas = computed(() => this.spaces().filter((s) => !isZone(s)));

  readonly racks = computed<RackInfo[]>(() => {
    const zones = this.zones();
    const areas = this.areas();
    return this.store
      .objects()
      .filter((o): o is Rack => o.type === 'rack')
      .map((rack) => ({
        rack,
        // The zone / area chosen for the rack wins; otherwise the space it stands in.
        zone:
          zones.find((z) => coded(z, rack.properties?.['zoneCode'])) ??
          zones.find((z) => centreInside(rack, z)) ??
          null,
        area:
          areas.find((a) => coded(a, rack.properties?.['areaCode'])) ??
          areas.find((a) => centreInside(rack, a)) ??
          null,
      }));
  });

  readonly hasFilter = computed(() => !!(this.zoneId() || this.areaId() || this.rackId()));

  /** Areas offered by the area filter (narrowed by the selected zone). */
  readonly areaOptions = computed(() => {
    const zone = this.zones().find((z) => z.id === this.zoneId());
    return zone ? this.areas().filter((a) => centreInside(a, zone)) : this.areas();
  });

  /** Racks offered by the rack filter (narrowed by the selected zone and area). */
  readonly rackOptions = computed(() =>
    this.racks().filter(
      (r) =>
        (!this.zoneId() || r.zone?.id === this.zoneId()) &&
        (!this.areaId() || r.area?.id === this.areaId()),
    ),
  );

  /** Racks that pass all three filters. Lists and highlights only look at these. */
  readonly filteredRacks = computed(() =>
    this.rackOptions().filter((r) => !this.rackId() || r.rack.id === this.rackId()),
  );

  private readonly cellIndex = computed(() => {
    const index = new Map<string, { rack: Rack; cell: RackCell }>();
    for (const { rack } of this.racks())
      for (const cell of rack.cells) if (cell.locationCode) index.set(cell.locationCode, { rack, cell });
    return index;
  });

  readonly items = computed<ItemRow[]>(() => {
    const master = new Map((this.store.wms()?.items ?? []).map((i) => [i.sku, i]));
    const rows = new Map<string, ItemRow>();
    for (const { rack } of this.filteredRacks()) {
      for (const cell of rack.cells) {
        for (const item of cell.items ?? []) {
          let row = rows.get(item.sku);
          if (!row) {
            const known = master.get(item.sku);
            row = {
              sku: item.sku,
              name: known?.name ?? item.name ?? item.sku,
              uom: item.uom ?? known?.uom ?? '',
              category: known?.category ?? '',
              quantity: 0,
              locations: 0,
              lowLocations: 0,
            };
            rows.set(item.sku, row);
          }
          const quantity = Number(item.quantity) || 0;
          row.quantity += quantity;
          row.locations++;
          if (item.minQuantity !== undefined && quantity < item.minQuantity) row.lowLocations++;
        }
      }
    }
    const term = this.search().trim().toLowerCase();
    return [...rows.values()]
      .filter((r) => !term || r.sku.toLowerCase().includes(term) || r.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly selectedItem = computed(
    () => this.items().find((i) => i.sku === this.selectedSku()) ?? null,
  );

  /** Every bay level (inside the filters) that holds the selected item, largest quantity first. */
  readonly itemLocations = computed<CellRef[]>(() => {
    const sku = this.selectedSku();
    if (!sku) return [];
    const refs: CellRef[] = [];
    for (const { rack } of this.filteredRacks()) {
      for (const cell of rack.cells) {
        const quantity = (cell.items ?? [])
          .filter((i) => i.sku === sku)
          .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
        if (quantity > 0) refs.push({ rack, cell, quantity });
      }
    }
    return refs.sort((a, b) => b.quantity - a.quantity);
  });

  readonly pickups = computed<WmsPickup[]>(() => this.store.wms()?.pickups ?? []);
  readonly selectedPickup = computed(
    () => this.pickups().find((p) => p.id === this.selectedPickupId()) ?? null,
  );
  readonly activity = computed<WmsActivity[]>(() => this.store.wms()?.activity ?? []);
  readonly selectedActivity = computed(
    () => this.activity().find((a) => a.id === this.selectedActivityId()) ?? null,
  );

  /** Bay levels to keep fully visible, per rack. null = nothing is being highlighted. */
  private readonly highlight = computed<Map<string, Set<string>> | null>(() => {
    const map = new Map<string, Set<string>>();
    const add = (rack: Rack, cell: RackCell) => {
      let set = map.get(rack.id);
      if (!set) map.set(rack.id, (set = new Set()));
      set.add(cell.id);
    };
    const byCode = (code: string | undefined) => {
      const ref = code ? this.cellIndex().get(code) : undefined;
      if (ref) add(ref.rack, ref.cell);
    };
    switch (this.tab()) {
      case 'items':
        if (!this.selectedSku()) return null;
        for (const ref of this.itemLocations()) add(ref.rack, ref.cell);
        return map;
      case 'pickup': {
        const pickup = this.selectedPickup();
        if (!pickup) return null;
        for (const line of pickup.lines) byCode(line.locationCode);
        return map;
      }
      case 'activity': {
        const entry = this.selectedActivity();
        if (!entry) return null;
        byCode(entry.locationCode);
        byCode(entry.fromLocationCode);
        return map;
      }
      default:
        return null;
    }
  });

  /** What the canvas fades out. Only active in view mode. */
  readonly focus = computed<RenderFocus | null>(() => {
    if (this.store.editMode()) return null;
    const highlight = this.highlight();
    const dim = new Set<string>();
    if (this.hasFilter()) {
      const keep = new Set(this.filteredRacks().map((r) => r.rack.id));
      for (const { rack } of this.racks()) if (!keep.has(rack.id)) dim.add(rack.id);
      const zoneId = this.zoneId();
      const areaIds = new Set(
        this.rackId()
          ? this.filteredRacks().map((r) => r.area?.id ?? '')
          : this.areaId()
            ? [this.areaId()]
            : this.areaOptions().map((a) => a.id),
      );
      for (const zone of this.zones()) if (zoneId && zone.id !== zoneId) dim.add(zone.id);
      for (const area of this.areas()) if (!areaIds.has(area.id)) dim.add(area.id);
    }
    if (highlight) for (const { rack } of this.racks()) if (!highlight.has(rack.id)) dim.add(rack.id);
    if (!highlight && !dim.size) return null;
    return { dim, cells: highlight ?? new Map() };
  });

  /** Quantity of the selected item in the bay level that is selected on the canvas. */
  readonly selectedItemInCell = computed(() => {
    const cell = this.store.selectedCell();
    const sku = this.selectedSku();
    if (!cell || !sku || this.tab() !== 'items') return null;
    return (cell.items ?? [])
      .filter((i) => i.sku === sku)
      .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  });

  /** Stock totals of the selected area / zone, or of the selected rack. */
  readonly selectionSummary = computed<StockSummary | null>(() => {
    const o = this.store.single();
    if (!o || (o.type !== 'space' && o.type !== 'rack')) return null;
    const racks =
      o.type === 'rack'
        ? [o as Rack]
        : this.racks()
            .filter((r) => centreInside(r.rack, o))
            .map((r) => r.rack);
    const summary: StockSummary = { racks: racks.length, levels: 0, inStock: 0, lowStock: 0, empty: 0 };
    for (const rack of racks) {
      for (const cell of rack.cells) {
        summary.levels++;
        if (cell.status === 'Low Stock') summary.lowStock++;
        else if (cell.items?.length || cell.status === 'In Stock' || cell.status === 'Occupied')
          summary.inStock++;
        else summary.empty++;
      }
    }
    return summary;
  });

  resolve(code: string | undefined): { rack: Rack; cell: RackCell } | null {
    return (code ? this.cellIndex().get(code) : null) ?? null;
  }

  setTab(tab: ViewTab | null): void {
    this.tab.set(this.tab() === tab ? null : tab);
  }

  toggleItem(sku: string): void {
    this.selectedSku.set(this.selectedSku() === sku ? null : sku);
  }

  togglePickup(id: string): void {
    this.selectedPickupId.set(this.selectedPickupId() === id ? null : id);
  }

  toggleActivity(id: string): void {
    this.selectedActivityId.set(this.selectedActivityId() === id ? null : id);
  }

  setZone(id: string): void {
    this.zoneId.set(id);
    if (!this.areaOptions().some((a) => a.id === this.areaId())) this.areaId.set('');
    if (!this.rackOptions().some((r) => r.rack.id === this.rackId())) this.rackId.set('');
  }

  setArea(id: string): void {
    this.areaId.set(id);
    if (!this.rackOptions().some((r) => r.rack.id === this.rackId())) this.rackId.set('');
  }

  setRack(id: string): void {
    this.rackId.set(id);
  }

  clearFilters(): void {
    this.zoneId.set('');
    this.areaId.set('');
    this.rackId.set('');
  }

  /** Selects a bay level on the canvas (from a list row). */
  selectCell(rack: Rack, cell: RackCell): void {
    this.selection.set([rack.id]);
    this.selection.selectCell(cell.id);
  }
}
