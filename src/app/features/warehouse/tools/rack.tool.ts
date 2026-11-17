import type { ToolService } from '../services/tool.service';
import { RectPlacementTool } from './placement.tool';

/**
 * Places the rack configured in the rack dialog ("Create new rack" or "Map existing rack").
 * Its generated footprint is preserved during placement and remains configuration-driven afterward.
 */
export class RackTool extends RectPlacementTool {
  protected override readonly allowDrag = false;

  constructor(ctx: ToolService) {
    super(ctx, 'rack');
  }
}
