import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import { round } from '../../../../core/utils/geometry';
import { ColorPickerComponent } from '../../../../shared/components/color-picker/color-picker.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { nextCode, takenCodes } from '../../models/object-factory';
import {
  MAX_RACK_COLUMNS,
  MAX_RACK_ROWS,
  Rack,
  RackConfig,
} from '../../models/rack.model';
import { WarehouseService } from '../../services/warehouse.service';
import { RackPreviewComponent, RackPreviewModel } from '../rack-preview/rack-preview.component';

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Rack creation dialog: configure bays, levels, zone / area and colour with a live preview.
 * It returns a RackConfig; the rack tool then lets the user place the rack on the canvas.
 */
@Component({
  standalone: true,
  selector: 'app-rack-dialog',
  imports: [ReactiveFormsModule, IconComponent, ColorPickerComponent, RackPreviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rack-dialog.component.html',
  styleUrl: './rack-dialog.component.scss',
})
export class RackDialogComponent {
  protected readonly ref = inject<DialogRef<RackConfig>>(DialogRef);
  private readonly store = inject(WarehouseService);
  private readonly fb = inject(FormBuilder);

  protected readonly maxRows = MAX_RACK_ROWS;
  protected readonly maxColumns = MAX_RACK_COLUMNS;

  private readonly nextId = nextCode('RACK', takenCodes(this.store.objects()));
  private readonly grid = this.store.gridSettings();

  protected readonly form = this.fb.nonNullable.group({
    name: [
      `Storage Rack ${Number(this.nextId.split('-')[1])}`,
      [Validators.required, Validators.maxLength(60)],
    ],
    rackId: [this.nextId, [Validators.required, Validators.maxLength(40)]],
    rackType: ['Selective Pallet'],
    zoneCode: [''],
    areaCode: [''],
    levels: [5, [Validators.required, Validators.min(1), Validators.max(MAX_RACK_ROWS)]],
    columns: [10, [Validators.required, Validators.min(1), Validators.max(MAX_RACK_COLUMNS)]],
    cellWidth: [
      this.grid.cellWidth,
      [Validators.required, Validators.min(1), Validators.max(20000)],
    ],
    cellHeight: [
      this.grid.cellHeight,
      [Validators.required, Validators.min(1), Validators.max(20000)],
    ],
    rowSpacing: [0, [Validators.min(0), Validators.max(500)]],
    columnSpacing: [0, [Validators.min(0), Validators.max(500)]],
    orientation: ['Horizontal' as 'Horizontal' | 'Vertical'],
    color: ['#2563EB'],
    label: [''],
  });

  // Zones and areas already on the canvas (WMS master data). Both are optional for a rack.
  private readonly spaces = this.store
    .objects()
    .filter((o) => o.type === 'space')
    .map((o) => ({
      code: String(o.properties?.['code'] ?? o.id),
      name: o.name,
      zone: o.properties?.['kind'] === 'zone',
      zoneCode: String(o.properties?.['zoneCode'] ?? ''),
    }));
  protected readonly zones = signal(this.spaces.filter((s) => s.zone));
  /** Areas of the selected zone, or every area when no zone is selected. */
  protected readonly areaOptions = computed(() => {
    const zone = this.value().zoneCode;
    return this.spaces.filter((s) => !s.zone && (!zone || s.zoneCode === zone));
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    {
      initialValue: this.form.getRawValue(),
    },
  );

  protected readonly color = computed(() => this.value().color ?? '#2563EB');

  protected readonly preview = computed<RackPreviewModel>(() => {
    const v = this.value();
    const rows = Math.min(MAX_RACK_ROWS, Math.max(1, Math.round(Number(v.levels) || 1)));
    const columns = Math.min(MAX_RACK_COLUMNS, Math.max(1, Math.round(Number(v.columns) || 1)));
    const rowSpacing = Math.max(0, Number(v.rowSpacing) || 0);
    const columnSpacing = Math.max(0, Number(v.columnSpacing) || 0);
    const cellWidth = Math.max(1, Number(v.cellWidth) || 1);
    const cellHeight = Math.max(1, Number(v.cellHeight) || 1);
    return {
      rows,
      columns,
      width: columns * cellWidth + (columns - 1) * columnSpacing,
      height: rows * cellHeight + (rows - 1) * rowSpacing,
      rowSpacing,
      columnSpacing,
      color: this.color(),
    };
  });

  /** Derived numbers shown under the preview so the relationship between the inputs is explicit. */
  protected readonly summary = computed(() => {
    const p = this.preview();
    const cellWidth = Math.max(1, Number(this.value().cellWidth) || 1);
    const cellHeight = Math.max(1, Number(this.value().cellHeight) || 1);
    const id = (this.value().rackId || 'RACK').trim();
    return {
      cells: p.rows * p.columns,
      cellWidth: round(cellWidth, 2),
      cellHeight: round(cellHeight, 2),
      fits: p.width <= this.grid.warehouseWidth && p.height <= this.grid.warehouseHeight,
      firstId: `${id}-R01-C01`,
      lastId: `${id}-R${pad2(p.rows)}-C${pad2(p.columns)}`,
    };
  });

  protected readonly idTaken = computed(() => {
    const id = (this.value().rackId ?? '').trim();
    return this.store.objects().some((o) => o.type === 'rack' && (o as Rack).rackId === id);
  });

  /** A different zone clears an area that does not belong to it. */
  protected onZoneChange(): void {
    const { zoneCode, areaCode } = this.form.getRawValue();
    const area = this.spaces.find((s) => !s.zone && s.code === areaCode);
    if (area && zoneCode && area.zoneCode !== zoneCode) this.form.controls.areaCode.setValue('');
  }

  /** Picking an area also fills in its zone. */
  protected onAreaChange(): void {
    const area = this.spaces.find((s) => !s.zone && s.code === this.form.getRawValue().areaCode);
    if (area?.zoneCode && this.zones().some((z) => z.code === area.zoneCode))
      this.form.controls.zoneCode.setValue(area.zoneCode);
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected submitCreate(): void {
    if (this.form.invalid || !this.summary().fits || this.idTaken()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const p = this.preview();
    this.ref.close({
      ...v,
      name: v.name.trim(),
      rackId: v.rackId.trim(),
      label: v.label.trim(),
      rows: p.rows,
      columns: p.columns,
      width: p.width,
      height: p.height,
      cellWidth: this.summary().cellWidth,
      cellHeight: this.summary().cellHeight,
      rowSpacing: p.rowSpacing,
      columnSpacing: p.columnSpacing,
      levels: p.rows,
      bays: p.columns,
    });
  }

}
