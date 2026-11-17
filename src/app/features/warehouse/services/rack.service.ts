import { Injectable } from '@angular/core';
import { Point, round, toLocal } from '../../../core/utils/geometry';
import { MAX_RACK_COLUMNS, MAX_RACK_ROWS, Rack, RackCell, RackConfig } from '../models/rack.model';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../models/warehouse.model';

type RackGrid = Pick<
  Rack,
  'rows' | 'columns' | 'cellWidth' | 'cellHeight' | 'rowSpacing' | 'columnSpacing'
>;

const GRID_KEYS = ['rows', 'columns', 'cellWidth', 'cellHeight', 'rowSpacing', 'columnSpacing'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const int = (v: unknown, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number(v) || min)));

/**
 * Rack geometry rules. One formula ties everything together:
 *   rack width  = columns × cell width  + (columns − 1) × column spacing
 *   rack height = rows    × cell height + (rows − 1)    × row spacing
 */
@Injectable({ providedIn: 'root' })
export class RackService {
  cellSize(r: RackGrid): { width: number; height: number } {
    return { width: r.cellWidth, height: r.cellHeight };
  }

  footprint(
    rows: number,
    columns: number,
    cellWidth: number,
    cellHeight: number,
    rowSpacing: number,
    columnSpacing: number,
  ) {
    return {
      width: columns * cellWidth + (columns - 1) * columnSpacing,
      height: rows * cellHeight + (rows - 1) * rowSpacing,
    };
  }

  /** A, B, … Z, AA, AB … */
  rowLabel(row: number): string {
    let label = '';
    for (let n = row; n > 0; n = Math.floor((n - 1) / 26))
      label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
    return label;
  }

  defaultPositionId(row: number, column: number): string {
    return `${this.rowLabel(row)}${pad2(column)}`;
  }

  /**
   * Builds rows × columns cells (row-major). Status, SKU, capacity and custom position IDs of
   * cells that still exist are carried over from `previous`.
   */
  generateCells(rack: RackGrid & { rackId: string }, previous: RackCell[] = []): RackCell[] {
    const size = this.cellSize(rack);
    const width = round(size.width, 3);
    const height = round(size.height, 3);
    const old = new Map(previous.map((c) => [`${c.row}:${c.column}`, c]));
    const cells: RackCell[] = [];
    for (let row = 1; row <= rack.rows; row++) {
      for (let column = 1; column <= rack.columns; column++) {
        const prev = old.get(`${row}:${column}`);
        const fallback = this.defaultPositionId(row, column);
        const cell: RackCell = {
          id: `${rack.rackId}-R${pad2(row)}-C${pad2(column)}`,
          rackId: rack.rackId,
          row,
          column,
          positionId: prev?.positionId || fallback,
          width,
          height,
          x: round((column - 1) * (width + rack.columnSpacing), 3),
          y: round((row - 1) * (height + rack.rowSpacing), 3),
        };
        if (prev?.status && prev.status !== 'Empty') cell.status = prev.status;
        if (prev?.sku) cell.sku = prev.sku;
        if (prev?.capacity !== undefined) cell.capacity = prev.capacity;
        if (prev?.locationCode) cell.locationCode = prev.locationCode;
        if (prev?.quantity !== undefined) cell.quantity = prev.quantity;
        if (prev?.items?.length) cell.items = prev.items;
        cells.push(cell);
      }
    }
    return cells;
  }

  /** Converts the creation dialog's values into object properties. */
  fromConfig(config: RackConfig): Record<string, unknown> {
    return {
      name: config.name,
      rackId: config.rackId,
      rackType: config.rackType,
      rows: config.rows,
      columns: config.columns,
      cellWidth: config.cellWidth,
      cellHeight: config.cellHeight,
      width: config.width,
      height: config.height,
      levels: config.levels,
      bays: config.bays,
      rowSpacing: config.rowSpacing,
      columnSpacing: config.columnSpacing,
      rotation: config.orientation === 'Vertical' ? 90 : 0,
      color: config.color,
      label: config.label,
      properties: {
        ...(config.zoneCode ? { zoneCode: config.zoneCode } : {}),
        ...(config.areaCode ? { areaCode: config.areaCode } : {}),
      },
    };
  }

  /**
   * Brings a rack back to a consistent state after any change.
   * Cell dimensions are authoritative. The outer footprint is always derived from rows, columns,
   * fixed cell dimensions and spacing, so viewport changes and object edits cannot stretch cells.
   * Legacy racks without explicit cell dimensions are migrated from their stored footprint.
   */
  reconcile(prev: Rack | null, next: Rack, changed: string[]): Rack {
    const legacyCellWidth =
      prev?.cellWidth ??
      (Number(next.width) - Number(next.columnSpacing || 0) * (Number(next.columns) - 1)) /
        Number(next.columns);
    const legacyCellHeight =
      prev?.cellHeight ??
      (Number(next.height) - Number(next.rowSpacing || 0) * (Number(next.rows) - 1)) /
        Number(next.rows);
    const rack: Rack = {
      ...next,
      rows: int(next.rows, 1, MAX_RACK_ROWS),
      columns: int(next.columns, 1, MAX_RACK_COLUMNS),
      levels: int(next.levels, 1, 99),
      bays: int(next.bays, 1, 999),
      rowSpacing: Math.max(0, Number(next.rowSpacing) || 0),
      columnSpacing: Math.max(0, Number(next.columnSpacing) || 0),
      cellWidth: Math.max(1, Number(next.cellWidth) || legacyCellWidth || 1),
      cellHeight: Math.max(1, Number(next.cellHeight) || legacyCellHeight || 1),
      rackId: String(next.rackId || next.id),
    };
    const gridChanged = changed.some((k) => GRID_KEYS.includes(k));
    // Keep the configured grid inside the logical warehouse while preserving at least 1 px cells.
    rack.columnSpacing = Math.min(
      rack.columnSpacing,
      rack.columns > 1 ? (WORLD_WIDTH - rack.columns) / (rack.columns - 1) : 0,
    );
    rack.rowSpacing = Math.min(
      rack.rowSpacing,
      rack.rows > 1 ? (WORLD_HEIGHT - rack.rows) / (rack.rows - 1) : 0,
    );
    rack.cellWidth = Math.min(
      rack.cellWidth,
      (WORLD_WIDTH - rack.columnSpacing * (rack.columns - 1)) / rack.columns,
    );
    rack.cellHeight = Math.min(
      rack.cellHeight,
      (WORLD_HEIGHT - rack.rowSpacing * (rack.rows - 1)) / rack.rows,
    );
    const footprint = this.footprint(
      rack.rows,
      rack.columns,
      rack.cellWidth,
      rack.cellHeight,
      rack.rowSpacing,
      rack.columnSpacing,
    );
    rack.width = round(footprint.width, 3);
    rack.height = round(footprint.height, 3);

    const stale =
      !prev ||
      gridChanged ||
      changed.includes('rackId') ||
      !Array.isArray(rack.cells) ||
      rack.cells.length !== rack.rows * rack.columns ||
      rack.cells.some((cell) => !Number.isFinite(cell.x) || !Number.isFinite(cell.y));
    if (stale) rack.cells = this.generateCells(rack, next.cells ?? []);
    return rack;
  }

  /** The cell under a world point, or null when the point is in a gap or outside the rack. */
  cellAt(rack: Rack, world: Point): RackCell | null {
    const p = toLocal(world, rack);
    const pitchX = rack.cellWidth + rack.columnSpacing;
    const pitchY = rack.cellHeight + rack.rowSpacing;
    const column = Math.floor(p.x / pitchX);
    const row = Math.floor(p.y / pitchY);
    if (column < 0 || row < 0 || column >= rack.columns || row >= rack.rows) return null;
    if (p.x - column * pitchX > rack.cellWidth || p.y - row * pitchY > rack.cellHeight) return null;
    return rack.cells[row * rack.columns + column] ?? null;
  }
}
