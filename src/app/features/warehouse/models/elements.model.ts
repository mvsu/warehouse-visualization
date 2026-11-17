import { WarehouseObject } from './warehouse-object.model';

export interface TextLabel extends WarehouseObject {
  type: 'text';
  elementId: string;
  fontSize: number;
  color: string;
  bold: boolean;
}

export interface ShapeObject extends WarehouseObject {
  type: 'shape';
  elementId: string;
  shapeKind: string;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  opacity: number;
}

/** Floor-plan or imported SVG used as a traceable background. */
export interface ImageObject extends WarehouseObject {
  type: 'image';
  elementId: string;
  src: string;
  opacity: number;
}
