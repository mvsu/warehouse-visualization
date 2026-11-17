/** Everything the canvas can hold. Areas ('space') come from the WMS; the editor adds the rest. */
export type ObjectType = 'rack' | 'space' | 'aisle' | 'text' | 'shape' | 'image';

/**
 * Base shape of everything placed on the canvas.
 * x / y are the top-left corner in world units before rotation; rotation is in degrees around the centre.
 */
export interface WarehouseObject {
  id: string;
  type: ObjectType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  locked: boolean;
  layerId: string;
  /** Objects sharing a groupId are selected and moved together. */
  groupId?: string;
  /** Free-form extension data (WMS payloads, custom attributes). */
  properties: Record<string, unknown>;
}

export interface WarehouseLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}
