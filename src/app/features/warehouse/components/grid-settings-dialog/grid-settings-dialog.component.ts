import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { WORLD_HEIGHT, WORLD_WIDTH, WarehouseGridSettings } from '../../models/warehouse.model';

@Component({
  standalone: true,
  selector: 'app-grid-settings-dialog',
  imports: [ReactiveFormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './grid-settings-dialog.component.html',
  styleUrl: './grid-settings-dialog.component.scss',
})
export class GridSettingsDialogComponent {
  protected readonly ref = inject<DialogRef<WarehouseGridSettings>>(DialogRef);
  private readonly data = inject<WarehouseGridSettings>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  protected readonly maxWidth = WORLD_WIDTH;
  protected readonly maxHeight = WORLD_HEIGHT;
  protected readonly form = this.fb.nonNullable.group({
    cellWidth: [
      this.data.cellWidth,
      [Validators.required, Validators.min(1), Validators.max(WORLD_WIDTH)],
    ],
    cellHeight: [
      this.data.cellHeight,
      [Validators.required, Validators.min(1), Validators.max(WORLD_HEIGHT)],
    ],
    warehouseWidth: [
      this.data.warehouseWidth,
      [Validators.required, Validators.min(2_000), Validators.max(WORLD_WIDTH)],
    ],
    warehouseHeight: [
      this.data.warehouseHeight,
      [Validators.required, Validators.min(2_000), Validators.max(WORLD_HEIGHT)],
    ],
    visible: this.data.visible,
    snap: this.data.snap,
  });

  protected summary(): { columns: number; rows: number } {
    const value = this.form.getRawValue();
    return {
      columns: Math.floor(value.warehouseWidth / Math.max(1, value.cellWidth)),
      rows: Math.floor(value.warehouseHeight / Math.max(1, value.cellHeight)),
    };
  }

  protected apply(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close(this.form.getRawValue());
  }
}
