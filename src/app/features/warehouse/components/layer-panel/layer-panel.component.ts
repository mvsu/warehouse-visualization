import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ToolbarButtonComponent } from '../../../../shared/components/toolbar-button/toolbar-button.component';
import { WarehouseLayer } from '../../models/warehouse-object.model';
import { ToolService } from '../../services/tool.service';
import { WarehouseService } from '../../services/warehouse.service';

/** Layer list (top-most first): visibility, locking, renaming, drag-to-reorder and select-all. */
@Component({
  standalone: true,
  selector: 'app-layer-panel',
  imports: [CdkDropList, CdkDrag, CdkDragHandle, IconComponent, ToolbarButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel surface" aria-label="Layers">
      <header>
        <strong>Layers</strong>
        <app-toolbar-button icon="close" label="Close layers" [size]="16" (pressed)="tools.layersOpen.set(false)" />
      </header>
      <ul cdkDropList [cdkDropListDisabled]="!store.editMode()" (cdkDropListDropped)="drop($event)">
        @for (layer of rows(); track layer.id) {
          <li cdkDrag cdkDragLockAxis="y" [class.muted]="!layer.visible">
            <span class="grip" cdkDragHandle [class.disabled]="!store.editMode()"><app-icon name="grip" [size]="14" /></span>
            @if (renaming() === layer.id) {
              <input
                #nameInput
                class="input name-input"
                [value]="layer.name"
                aria-label="Layer name"
                (keydown.enter)="rename(layer, nameInput.value)"
                (keydown.escape)="renaming.set(null)"
                (blur)="rename(layer, nameInput.value)"
              />
            } @else {
              <button type="button" class="name" [attr.data-tip]="'Select all in ' + layer.name" data-tip-pos="top" (click)="store.selectLayer(layer.id)" (dblclick)="startRename(layer)">
                <span>{{ layer.name }}</span>
                <span class="count">{{ layer.count }}</span>
              </button>
            }
            <app-toolbar-button icon="edit" label="Rename" [size]="14" [disabled]="!store.editMode()" tipPosition="top" (pressed)="startRename(layer)" />
            <app-toolbar-button [icon]="layer.locked ? 'lock' : 'unlock'" [label]="layer.locked ? 'Unlock layer' : 'Lock layer'" [size]="14" [active]="layer.locked" [disabled]="!store.editMode()" tipPosition="top" (pressed)="store.patchLayer(layer.id, { locked: !layer.locked })" />
            <app-toolbar-button [icon]="layer.visible ? 'view' : 'hidden'" [label]="layer.visible ? 'Hide layer' : 'Show layer'" [size]="14" tipPosition="top-end" (pressed)="store.patchLayer(layer.id, { visible: !layer.visible })" />
          </li>
        }
      </ul>
      <footer>Top of the list draws in front. Click a name to select everything on that layer.</footer>
    </section>
  `,
  styles: `
    :host {
      position: absolute;
      left: calc(var(--ruler) + 64px);
      top: 50%;
      transform: translateY(-50%);
      z-index: 4;
    }
    .panel {
      width: 292px;
      max-height: min(560px, calc(100vh - 160px));
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-pop);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 8px 6px 14px;
      font-size: 13.5px;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0 6px;
      overflow-y: auto;
    }
    li {
      display: flex;
      align-items: center;
      gap: 1px;
      height: 34px;
      border-radius: var(--radius-sm);
      background: #fff;
    }
    li:hover {
      background: var(--app-bg);
    }
    li.muted .name {
      color: var(--text-2);
    }
    .grip {
      display: flex;
      padding: 4px 2px;
      color: #94a3b8;
      cursor: grab;
    }
    .grip.disabled {
      opacity: 0.3;
      cursor: default;
    }
    .name {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 4px;
      border: 0;
      background: transparent;
      text-align: left;
      border-radius: var(--radius-sm);
    }
    .name span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .count {
      color: var(--text-2);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .name-input {
      flex: 1;
      height: 26px;
    }
    footer {
      padding: 8px 14px 10px;
      color: var(--text-2);
      font-size: 11.5px;
    }
    .cdk-drag-preview {
      box-shadow: var(--shadow-pop);
    }
    .cdk-drag-placeholder {
      opacity: 0.3;
    }
    .cdk-drag-animating,
    ul.cdk-drop-list-dragging li:not(.cdk-drag-placeholder) {
      transition: transform 0.15s ease;
    }
  `,
})
export class LayerPanelComponent {
  protected readonly store = inject(WarehouseService);
  protected readonly tools = inject(ToolService);
  protected readonly renaming = signal<string | null>(null);

  /** Layers are stored bottom-to-top; the panel lists them top-to-bottom. */
  protected readonly rows = computed(() => {
    const counts = new Map<string, number>();
    for (const o of this.store.objects()) counts.set(o.layerId, (counts.get(o.layerId) ?? 0) + 1);
    return [...this.store.layers()].reverse().map((l) => ({ ...l, count: counts.get(l.id) ?? 0 }));
  });

  protected drop(event: CdkDragDrop<unknown>): void {
    const ids = this.rows().map((l) => l.id);
    moveItemInArray(ids, event.previousIndex, event.currentIndex);
    this.store.reorderLayers(ids.reverse());
  }

  protected startRename(layer: WarehouseLayer): void {
    if (!this.store.editMode()) return;
    this.renaming.set(layer.id);
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('app-layer-panel .name-input');
      input?.focus();
      input?.select();
    });
  }

  protected rename(layer: WarehouseLayer, value: string): void {
    if (this.renaming() !== layer.id) return;
    this.renaming.set(null);
    const name = value.trim();
    if (name && name !== layer.name) this.store.patchLayer(layer.id, { name });
  }
}
