import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ToolbarButtonComponent } from '../../../../shared/components/toolbar-button/toolbar-button.component';
import { EditorActionsService, ImportKind } from '../../services/editor-actions.service';
import { WarehouseGridSettings } from '../../models/warehouse.model';
import { ToolService } from '../../services/tool.service';
import { WarehouseService } from '../../services/warehouse.service';
import { GridSettingsDialogComponent } from '../grid-settings-dialog/grid-settings-dialog.component';

const STATUS_LABEL = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes' } as const;

/** Top navigation: warehouse identity and switching, save state, history, import/export, mode and sharing. */
@Component({
  standalone: true,
  selector: 'app-warehouse-topbar',
  imports: [IconComponent, ToolbarButtonComponent, CdkMenuTrigger, CdkMenu, CdkMenuItem, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './warehouse-topbar.component.html',
  styleUrl: './warehouse-topbar.component.scss',
})
export class WarehouseTopbarComponent {
  protected readonly store = inject(WarehouseService);
  protected readonly actions = inject(EditorActionsService);
  private readonly tools = inject(ToolService);
  private readonly dialog = inject(Dialog);

  private readonly jsonInput = viewChild.required<ElementRef<HTMLInputElement>>('jsonInput');
  private readonly imageInput = viewChild.required<ElementRef<HTMLInputElement>>('imageInput');

  protected readonly renaming = signal(false);
  protected readonly imageAccept = signal('image/*');
  protected readonly statusLabel = computed(() => STATUS_LABEL[this.store.saveStatus()]);

  protected startRename(): void {
    this.renaming.set(true);
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('app-warehouse-topbar .name-input');
      input?.focus();
      input?.select();
    });
  }

  protected commitRename(value: string): void {
    if (!this.renaming()) return;
    this.renaming.set(false);
    this.store.rename(value);
  }

  protected setMode(edit: boolean): void {
    this.store.editMode.set(edit);
    if (!edit) this.tools.setTool('select');
  }

  protected pickFile(kind: 'json' | 'svg' | 'image'): void {
    if (kind === 'json') {
      this.jsonInput().nativeElement.click();
      return;
    }
    this.imageAccept.set(
      kind === 'svg'
        ? '.svg,image/svg+xml'
        : 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml',
    );
    // Let the accept attribute update before the picker opens.
    setTimeout(() => this.imageInput().nativeElement.click());
  }

  protected async onFile(kind: ImportKind, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.actions.import(kind, file);
  }

  protected openGridSettings(): void {
    const ref = this.dialog.open<WarehouseGridSettings, WarehouseGridSettings>(
      GridSettingsDialogComponent,
      {
        data: this.store.gridSettings(),
        backdropClass: 'dialog-backdrop',
        panelClass: 'dialog-panel',
        autoFocus: 'first-tabbable',
        ariaLabel: 'Grid settings',
      },
    );
    ref.closed.subscribe((settings) => {
      if (settings) this.store.updateGridSettings(settings);
    });
  }

  protected async newWarehouse(): Promise<void> {
    await this.store.newLayout();
    this.openGridSettings();
  }
}
