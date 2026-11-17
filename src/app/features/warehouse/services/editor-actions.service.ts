import { Dialog } from '@angular/cdk/dialog';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ExportService } from '../../../core/services/export.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  ConfirmationData,
  ConfirmationDialogComponent,
} from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { ObjectSelectionService } from './object-selection.service';
import { ToolService } from './tool.service';
import { WarehouseService } from './warehouse.service';

export type ExportKind = 'png' | 'svg' | 'pdf' | 'json';
export type ImportKind = 'json' | 'image';

/**
 * User-level commands shared by the top bar, toolbars, context menu and keyboard shortcuts,
 * so every entry point behaves identically.
 */
@Injectable({ providedIn: 'root' })
export class EditorActionsService {
  private readonly store = inject(WarehouseService);
  private readonly selection = inject(ObjectSelectionService);
  private readonly tools = inject(ToolService);
  private readonly exporter = inject(ExportService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly hasSelection = computed(() => this.selection.count() > 0);
  readonly canEdit = computed(() => this.store.editMode() && this.hasSelection());
  readonly canGroup = computed(() => this.store.editMode() && this.selection.count() > 1);
  readonly canUngroup = computed(
    () => this.store.editMode() && this.store.selected().some((o) => o.groupId),
  );
  readonly allLocked = computed(
    () => this.hasSelection() && this.store.selected().every((o) => o.locked),
  );

  private ids(): string[] {
    return this.selection.ids();
  }

  /** Ids of the selected objects that may be modified (unlocked object on an unlocked layer). */
  private editableIds(): string[] {
    return this.store
      .selected()
      .filter((o) => !this.store.isLocked(o))
      .map((o) => o.id);
  }

  copy(): void {
    const count = this.store.copy(this.ids());
    if (count) this.toast.show(count === 1 ? 'Copied 1 object.' : `Copied ${count} objects.`);
  }

  paste(): void {
    if (this.store.editMode()) this.store.paste();
  }

  duplicate(): void {
    if (this.canEdit()) this.store.duplicate(this.ids());
  }

  delete(): void {
    if (!this.canEdit()) return;
    const ids = this.editableIds();
    if (!ids.length) this.toast.show('The selection is locked. Unlock it to delete.');
    else this.store.remove(ids);
  }

  group(): void {
    if (this.canGroup()) this.store.group(this.ids());
  }

  ungroup(): void {
    if (this.canUngroup()) this.store.ungroup(this.ids());
  }

  toggleLock(): void {
    if (this.canEdit()) this.store.setLocked(this.ids(), !this.allLocked());
  }

  bringToFront(): void {
    if (this.canEdit()) this.store.bringToFront(this.ids());
  }

  sendToBack(): void {
    if (this.canEdit()) this.store.sendToBack(this.ids());
  }

  selectAll(): void {
    this.selection.set(
      this.store
        .renderList()
        .filter((o) => !this.store.isLocked(o))
        .map((o) => o.id),
    );
  }

  nudge(dx: number, dy: number): void {
    if (this.canEdit()) this.store.nudge(this.ids(), dx, dy);
  }

  undo(): void {
    this.store.undo();
  }

  redo(): void {
    this.store.redo();
  }

  async save(): Promise<void> {
    await this.store.saveNow();
    if (this.store.saveStatus() === 'saved') this.toast.show('Layout saved.', 'success');
  }

  fitSelection(): void {
    this.tools.viewport.fitToScreen(this.store.selectionBounds() ?? this.store.contentBounds());
  }

  async export(kind: ExportKind): Promise<void> {
    const name = this.store.name();
    const objects = this.store.renderList();
    if (kind === 'json') {
      this.exporter.download(
        this.store.exportJson(),
        this.exporter.filename(name, 'json'),
        'application/json',
      );
      return;
    }
    if (!objects.length) {
      this.toast.show('Nothing to export yet. Add something to the canvas first.');
      return;
    }
    try {
      if (kind === 'svg') {
        this.exporter.download(
          this.exporter.toSvg(objects)!,
          this.exporter.filename(name, 'svg'),
          'image/svg+xml',
        );
      } else {
        const blob =
          kind === 'png' ? await this.exporter.toPng(objects) : await this.exporter.toPdf(objects);
        if (!blob) throw new Error('empty');
        this.exporter.download(blob, this.exporter.filename(name, kind));
      }
    } catch {
      this.toast.show(
        `The ${kind.toUpperCase()} export failed. Try exporting a smaller area or use JSON.`,
        'error',
      );
    }
  }

  async import(kind: ImportKind, file: File): Promise<void> {
    try {
      if (kind === 'json') {
        await this.store.importJson(await file.text());
        this.toast.show(`Imported “${this.store.name()}”.`, 'success');
      } else {
        const image = await this.exporter.readImage(file);
        this.store.editMode.set(true);
        this.tools.setTool('select');
        this.store.addImage(
          image.src,
          image.width,
          image.height,
          file.name.replace(/\.[^.]+$/, ''),
        );
        this.toast.show(
          'Background added. Resize it to match your coordinates, then lock it in the inspector.',
          'success',
        );
      }
    } catch (error) {
      this.toast.show(
        error instanceof Error ? error.message : 'The file could not be imported.',
        'error',
      );
    }
  }

  async share(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.store.exportJson());
      this.toast.show(
        'Layout JSON copied to the clipboard. Anyone can open it with Import → Layout JSON.',
        'success',
      );
    } catch {
      await this.export('json');
      this.toast.show('Clipboard is unavailable, so the layout was downloaded as JSON instead.');
    }
  }

  async confirm(data: ConfirmationData): Promise<boolean> {
    const ref = this.dialog.open<boolean, ConfirmationData>(ConfirmationDialogComponent, {
      data,
      backdropClass: 'dialog-backdrop',
      panelClass: 'dialog-panel',
    });
    return (await firstValueFrom(ref.closed)) === true;
  }

  async deleteLayout(id: string, name: string): Promise<void> {
    const ok = await this.confirm({
      title: `Delete “${name}”?`,
      message: 'The layout is removed from this browser. This cannot be undone.',
      confirmLabel: 'Delete layout',
      danger: true,
    });
    if (ok) await this.store.deleteLayout(id);
  }
}
