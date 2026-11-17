import { Point } from '../../../core/utils/geometry';
import { ObjectType } from '../models/warehouse-object.model';

export type ToolId = 'select' | 'pan' | ObjectType;

/** Pointer event normalised to canvas coordinates. */
export interface ToolPointerEvent {
  /** Position relative to the canvas element, in CSS pixels. */
  screen: Point;
  /** Same position in world units. */
  world: Point;
  shift: boolean;
  alt: boolean;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  ctrl: boolean;
  button: number;
}

/**
 * A canvas tool receives pointer input while it is active.
 * Tools hold only transient interaction state; all document changes go through the store.
 */
export interface CanvasTool {
  readonly cursor: string;
  onPointerDown(e: ToolPointerEvent): void;
  onPointerMove(e: ToolPointerEvent): void;
  onPointerUp(e: ToolPointerEvent): void;
  onDoubleClick?(e: ToolPointerEvent): void;
  onContextMenu?(e: ToolPointerEvent): void;
  /** Escape was pressed. Return true when the tool handled it and should stay active. */
  cancel?(): boolean;
  deactivate?(): void;
}
