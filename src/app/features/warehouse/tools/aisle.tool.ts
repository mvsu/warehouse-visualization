import { Bounds } from '../../../core/utils/geometry';
import type { ToolService } from '../services/tool.service';
import type { Patch } from '../services/warehouse.service';
import { RectPlacementTool } from './placement.tool';

/** Aisles: a click uses the configured width/length/direction, a drag infers the direction from the longer side. */
export class AisleTool extends RectPlacementTool {
  constructor(ctx: ToolService) {
    super(ctx, 'aisle');
  }

  protected override overrides(): Patch {
    const config = this.ctx.config('aisle');
    const length = Number(config['aisleLength']) || 400;
    const width = Number(config['aisleWidth']) || 40;
    const vertical = config['direction'] === 'Vertical';
    return { ...config, width: vertical ? width : length, height: vertical ? length : width };
  }

  protected override fit(rect: Bounds): Patch {
    return { ...rect, rotation: 0, direction: rect.height > rect.width ? 'Vertical' : 'Horizontal' };
  }
}
