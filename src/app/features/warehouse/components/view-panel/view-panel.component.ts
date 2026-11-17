import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ToolbarButtonComponent } from '../../../../shared/components/toolbar-button/toolbar-button.component';
import { Rack, STOCK_COLORS } from '../../models/rack.model';
import { ObjectSelectionService } from '../../services/object-selection.service';
import { ViewModeService, ViewTab } from '../../services/view-mode.service';
import { WarehouseService } from '../../services/warehouse.service';

const TITLES: Record<ViewTab, string> = {
  items: 'Items',
  pickup: 'Pickup',
  activity: 'Activity',
};

/**
 * Right-hand slider of the read-only view mode. It lists items, pick lists or activity for the
 * active tab and shows what is stored in the bay level, rack or area selected on the canvas.
 */
@Component({
  standalone: true,
  selector: 'app-view-panel',
  imports: [ToolbarButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './view-panel.component.html',
  styleUrl: './view-panel.component.scss',
})
export class ViewPanelComponent {
  protected readonly view = inject(ViewModeService);
  protected readonly store = inject(WarehouseService);
  private readonly selection = inject(ObjectSelectionService);

  protected readonly legend = Object.entries(STOCK_COLORS);
  protected readonly single = computed(() => {
    const o = this.store.single();
    return o && (o.type === 'rack' || o.type === 'space') ? o : null;
  });
  protected readonly cell = this.store.selectedCell;
  protected readonly visible = computed(() => !!this.view.tab() || !!this.single());
  protected readonly title = computed(() => {
    const tab = this.view.tab();
    return tab ? TITLES[tab] : 'Details';
  });
  protected readonly cellStock = computed(() => {
    const cell = this.cell();
    if (!cell) return null;
    const items = cell.items ?? [];
    const status = cell.status ?? 'Empty';
    return {
      code: cell.locationCode || cell.positionId,
      level: cell.row,
      bay: cell.column,
      status,
      color: STOCK_COLORS[status] ?? '#94A3B8',
      items,
      quantity: cell.quantity ?? items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
      capacity: cell.capacity,
    };
  });

  protected close(): void {
    if (this.view.tab()) this.view.setTab(null);
    else this.selection.clear();
  }

  protected search(event: Event): void {
    this.view.search.set((event.target as HTMLInputElement).value);
  }

  protected statusColor(status: string): string {
    return STOCK_COLORS[status] ?? '#E2E8F0';
  }

  protected rackName(rack: Rack): string {
    return rack.name;
  }

  /** Jumps to the bay level a pick line or activity entry refers to. */
  protected open(code: string | undefined): void {
    const ref = this.view.resolve(code);
    if (ref) this.view.selectCell(ref.rack, ref.cell);
  }

  protected where(code: string | undefined): string {
    const ref = this.view.resolve(code);
    return ref ? `${ref.rack.name} · bay ${ref.cell.column} · level ${ref.cell.row}` : (code ?? '');
  }
}
