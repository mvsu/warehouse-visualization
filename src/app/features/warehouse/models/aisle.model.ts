import { WarehouseObject } from './warehouse-object.model';

/**
 * A horizontal aisle runs along X (width = aisle length, height = aisle width);
 * a vertical aisle runs along Y (width = aisle width, height = aisle length).
 */
export interface Aisle extends WarehouseObject {
  type: 'aisle';
  aisleId: string;
  direction: 'Horizontal' | 'Vertical';
  travelType: 'One-way' | 'Two-way';
  /** Forward = left-to-right / top-to-bottom. */
  travelDirection: 'Forward' | 'Reverse';
  color: string;
}
