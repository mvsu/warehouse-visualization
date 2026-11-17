import { WarehouseObject } from './warehouse-object.model';

export interface SpaceTypePreset {
  type: string;
  fill: string;
  border: string;
}

export const SPACE_TYPES: SpaceTypePreset[] = [
  { type: 'Storage Area', fill: '#DBEAFE', border: '#2563EB' },
  { type: 'Receiving Area', fill: '#DCFCE7', border: '#16A34A' },
  { type: 'Dispatch Area', fill: '#FFEDD5', border: '#EA580C' },
  { type: 'Packing Area', fill: '#F3E8FF', border: '#9333EA' },
  { type: 'Picking Area', fill: '#CFFAFE', border: '#0891B2' },
  { type: 'Quality Check Area', fill: '#FEF9C3', border: '#CA8A04' },
  { type: 'Inventory Area', fill: '#E0E7FF', border: '#4F46E5' },
  { type: 'Office Space', fill: '#F1F5F9', border: '#64748B' },
  { type: 'Restricted Area', fill: '#FEE2E2', border: '#DC2626' },
  { type: 'Empty Space', fill: '#F8FAFC', border: '#94A3B8' },
  { type: 'Custom Space', fill: '#FCE7F3', border: '#DB2777' },
];

export interface Space extends WarehouseObject {
  type: 'space';
  spaceId: string;
  spaceType: string;
  fillColor: string;
  borderColor: string;
  /** 0 (fully transparent) to 1 (opaque). */
  opacity: number;
  labelVisible: boolean;
  cornerRadius: number;
}
