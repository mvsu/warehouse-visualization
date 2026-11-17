import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ViewModeService } from '../../services/view-mode.service';

/** View mode filter bar: narrows the canvas to a zone, an area or a single rack; everything else fades. */
@Component({
  standalone: true,
  selector: 'app-view-filters',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filters surface" role="toolbar" aria-label="Filters">
      <app-icon name="search" [size]="15" />
      <label>
        <span>Zone</span>
        <select class="input" [value]="view.zoneId()" (change)="view.setZone(value($event))">
          <option value="">All zones</option>
          @for (zone of view.zones(); track zone.id) {
            <option [value]="zone.id" [selected]="zone.id === view.zoneId()">{{ zone.name }}</option>
          }
        </select>
      </label>
      <label>
        <span>Area</span>
        <select class="input" [value]="view.areaId()" (change)="view.setArea(value($event))">
          <option value="">All areas</option>
          @for (area of view.areaOptions(); track area.id) {
            <option [value]="area.id" [selected]="area.id === view.areaId()">{{ area.name }}</option>
          }
        </select>
      </label>
      <label>
        <span>Rack</span>
        <select class="input" [value]="view.rackId()" (change)="view.setRack(value($event))">
          <option value="">All racks</option>
          @for (entry of view.rackOptions(); track entry.rack.id) {
            <option [value]="entry.rack.id" [selected]="entry.rack.id === view.rackId()">
              {{ entry.rack.name }}
            </option>
          }
        </select>
      </label>
      @if (view.hasFilter()) {
        <button type="button" class="btn" (click)="view.clearFilters()">Clear</button>
      }
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      top: calc(var(--ruler) + 12px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 3;
    }
    .filters {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      color: var(--text-2);
    }
    label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }
    select {
      width: 150px;
      height: 28px;
      color: var(--text);
    }
    .btn {
      height: 28px;
    }
  `,
})
export class ViewFiltersComponent {
  protected readonly view = inject(ViewModeService);

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
