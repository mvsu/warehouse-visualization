import { CanvasTool } from './tool.model';

/**
 * Hand tool. The canvas component performs the actual panning (including
 * middle-button drag), so this tool only supplies the cursor.
 */
export class PanTool implements CanvasTool {
  readonly cursor = 'grab';
  onPointerDown(): void {}
  onPointerMove(): void {}
  onPointerUp(): void {}
}
