import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { ToolbarButtonComponent } from '../../../../shared/components/toolbar-button/toolbar-button.component';
import { OBJECT_DEFS } from '../../models/object-schema';
import { ObjectType } from '../../models/warehouse-object.model';
import { ToolService } from '../../services/tool.service';
import { ViewModeService, ViewTab } from '../../services/view-mode.service';
import { WarehouseService } from '../../services/warehouse.service';
import { ToolId } from '../../tools/tool.model';

interface ToolEntry {
  id: ToolId;
  label: string;
  icon: IconName;
  shortcut: string;
}

interface ObjectEntry {
  label: string;
  icon: IconName;
  type: ObjectType;
  preset: Record<string, unknown>;
}

const entry = (type: ObjectType, shortcut = '', label?: string): ToolEntry => ({
  id: type,
  label: label ?? OBJECT_DEFS[type].label,
  icon: OBJECT_DEFS[type].icon,
  shortcut,
});

/** Floating left toolbar: navigation tools, the most used warehouse elements, layers and an overflow menu. */
@Component({
  standalone: true,
  selector: 'app-warehouse-toolbar',
  imports: [ToolbarButtonComponent, IconComponent, CdkMenuTrigger, CdkMenu, CdkMenuItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar surface" role="toolbar" aria-label="Tools" aria-orientation="vertical">
      @for (tool of navigation; track tool.id) {
        <app-toolbar-button [icon]="tool.icon" [label]="tool.label" [shortcut]="tool.shortcut" [toggle]="true" [active]="tools.activeToolId() === tool.id" tipPosition="right" (pressed)="tools.setTool(tool.id)" />
      }
      <span class="divider-h"></span>
      @if (!store.editMode()) {
        @for (tab of viewTabs; track tab.id) {
          <app-toolbar-button [icon]="tab.icon" [label]="tab.label" [toggle]="true" [active]="view.tab() === tab.id" tipPosition="right" (pressed)="view.setTab(tab.id)" />
        }
      } @else {
      @for (tool of creation; track tool.id) {
        <app-toolbar-button [icon]="tool.icon" [label]="tool.label" [shortcut]="tool.shortcut" [toggle]="true" [active]="tools.activeToolId() === tool.id" tipPosition="right" (pressed)="create(tool.id)" />
      }
      <app-toolbar-button icon="shape" label="Objects" tipPosition="right" [active]="isObjectActive()" [cdkMenuTriggerFor]="objectMenu" [cdkMenuPosition]="menuPosition" />
      <span class="divider-h"></span>
      <app-toolbar-button icon="layers" label="Layers" shortcut="L" [toggle]="true" [active]="tools.layersOpen()" tipPosition="right" (pressed)="tools.layersOpen.set(!tools.layersOpen())" />
      }
    </div>

    <ng-template #objectMenu>
      <div class="menu" cdkMenu>
        <div class="menu-label">Objects</div>
        @for (object of objects; track object.label) {
          <button class="menu-item" cdkMenuItem (cdkMenuItemTriggered)="addObject(object)">
            <app-icon [name]="object.icon" [size]="16" />
            <span class="grow">{{ object.label }}</span>
          </button>
        }
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      position: absolute;
      left: calc(var(--ruler) + 12px);
      top: 50%;
      transform: translateY(-50%);
      z-index: 3;
    }
    .toolbar {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 5px;
    }
    @media (max-height: 720px) {
      .toolbar {
        display: grid;
        grid-template-columns: repeat(2, auto);
      }
      .divider-h {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class WarehouseToolbarComponent {
  protected readonly tools = inject(ToolService);
  protected readonly store = inject(WarehouseService);
  protected readonly view = inject(ViewModeService);

  /** View mode replaces the drawing tools with the information tabs. */
  protected readonly viewTabs: { id: ViewTab; label: string; icon: IconName }[] = [
    { id: 'items', label: 'Items', icon: 'storage' },
    { id: 'pickup', label: 'Pickup', icon: 'forklift' },
    { id: 'activity', label: 'Activity', icon: 'file-text' },
  ];

  protected readonly navigation: ToolEntry[] = [
    { id: 'select', label: 'Select', icon: 'select', shortcut: 'V' },
    { id: 'pan', label: 'Hand / Pan', icon: 'pan', shortcut: 'H' },
  ];
  /** The editor adds three things only: racks, aisles and objects. */
  protected readonly creation: ToolEntry[] = [entry('rack', 'R'), entry('aisle', 'A')];
  /** Objects menu: the only free shapes that are saved to the database. */
  protected readonly objects: ObjectEntry[] = [
    { label: 'Rectangle', icon: 'square', type: 'shape', preset: { shapeKind: 'Rectangle', width: 100, height: 50 } },
    { label: 'Circle', icon: 'shape', type: 'shape', preset: { shapeKind: 'Circle', width: 50, height: 50 } },
    { label: 'Triangle', icon: 'shape', type: 'shape', preset: { shapeKind: 'Triangle', width: 50, height: 50 } },
    { label: 'Text', icon: 'text', type: 'text', preset: {} },
  ];
  protected readonly menuPosition = [{ originX: 'end' as const, originY: 'bottom' as const, overlayX: 'start' as const, overlayY: 'bottom' as const, offsetX: 10 }];

  protected create(id: ToolId): void {
    this.tools.startCreation(id as ObjectType);
  }

  protected addObject(object: ObjectEntry): void {
    this.tools.startCreation(object.type, object.preset);
  }

  protected isObjectActive(): boolean {
    const id = this.tools.activeToolId();
    return id === 'shape' || id === 'text';
  }
}
