import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { FieldDef } from '../../../features/warehouse/models/object-schema';
import { ColorPickerComponent } from '../color-picker/color-picker.component';

export interface FieldOption {
  value: string;
  label: string;
}

/**
 * One labelled property editor, rendered from a FieldDef and bound to a reactive FormControl.
 * `value` mirrors the model value for parts that are not form controls (colour swatch, read-only text, range read-out).
 */
@Component({
  standalone: true,
  selector: 'app-property-field',
  imports: [ReactiveFormsModule, ColorPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.inline]': "field().kind === 'toggle'" },
  template: `
    @if (field(); as f) {
    <label>
      <span class="label">{{ f.label }}</span>
      @switch (f.kind) {
        @case ('readonly') {
          <span class="readonly">{{ value() }}</span>
        }
        @case ('select') {
          @if (control(); as c) {
            <select class="input" [formControl]="c" [attr.data-key]="f.key">
              @for (opt of resolvedOptions(); track opt.value) {
                <option [value]="opt.value">{{ opt.label }}</option>
              }
            </select>
          }
        }
        @case ('number') {
          @if (control(); as c) {
            <span class="number">
              <input
                class="input"
                type="number"
                [formControl]="c"
                [attr.min]="f.min ?? null"
                [attr.max]="f.max ?? null"
                [attr.step]="f.step ?? 'any'"
                [attr.data-key]="f.key"
              />
              @if (f.suffix) {
                <span class="suffix">{{ f.suffix }}</span>
              }
            </span>
          }
        }
        @case ('range') {
          @if (control(); as c) {
            <span class="range">
              <input type="range" [formControl]="c" [attr.min]="f.min ?? 0" [attr.max]="f.max ?? 1" [attr.step]="f.step ?? 0.05" [attr.data-key]="f.key" />
              <output>{{ percent() }}</output>
            </span>
          }
        }
        @case ('color') {
          @if (control(); as c) {
            <app-color-picker [control]="c" [value]="colorValue()" [label]="f.label" [key]="f.key" />
          }
        }
        @case ('toggle') {
          @if (control(); as c) {
            <input class="switch" type="checkbox" role="switch" [formControl]="c" [attr.data-key]="f.key" />
          }
        }
        @default {
          @if (control(); as c) {
            <input class="input" type="text" [formControl]="c" [attr.data-key]="f.key" autocomplete="off" />
          }
        }
      }
    </label>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .label {
      color: var(--text-2);
      font-size: 11.5px;
      font-weight: 500;
    }
    :host(.inline) label {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      min-height: 30px;
    }
    .readonly {
      display: flex;
      align-items: center;
      height: 30px;
      padding: 0 8px;
      border-radius: var(--radius-sm);
      background: var(--app-bg);
      font-variant-numeric: tabular-nums;
    }
    .number {
      position: relative;
      display: block;
    }
    .suffix {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-2);
      font-size: 11px;
      pointer-events: none;
    }
    .range {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 30px;
    }
    .range input {
      flex: 1;
      min-width: 0;
      accent-color: var(--primary);
    }
    .range output {
      width: 38px;
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: var(--text-2);
    }
    .switch {
      appearance: none;
      width: 32px;
      height: 18px;
      margin: 0;
      border-radius: 999px;
      background: var(--border-strong);
      position: relative;
      cursor: pointer;
      transition: background-color 0.15s;
    }
    .switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.3);
      transition: transform 0.15s;
    }
    .switch:checked {
      background: var(--primary);
    }
    .switch:checked::after {
      transform: translateX(14px);
    }
    .switch:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
})
export class PropertyFieldComponent {
  readonly field = input.required<FieldDef>();
  readonly control = input<FormControl | null>(null);
  readonly value = input<unknown>(undefined);
  /** Overrides the field's static options (used for dynamic lists such as layers). */
  readonly options = input<FieldOption[] | null>(null);

  protected readonly resolvedOptions = computed<FieldOption[]>(
    () => this.options() ?? (this.field().options ?? []).map((o) => ({ value: o, label: o })),
  );
  protected readonly colorValue = computed(() => String(this.value() ?? ''));
  protected readonly percent = computed(() => `${Math.round(Number(this.value() ?? 0) * 100)}%`);
}
