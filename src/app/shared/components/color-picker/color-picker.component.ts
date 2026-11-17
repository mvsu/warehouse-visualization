import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

const HEX = /^#[0-9a-f]{6}$/i;

/** Colour swatch (native picker) plus an editable hex value, both driving one FormControl. */
@Component({
  standalone: true,
  selector: 'app-color-picker',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="swatch" [style.background]="value()">
      <input
        type="color"
        [value]="safe()"
        [disabled]="control().disabled"
        [attr.aria-label]="label() + ' picker'"
        (input)="pick($event)"
      />
    </span>
    <input class="input" type="text" maxlength="7" spellcheck="false" [formControl]="control()" [attr.data-key]="key()" [attr.aria-label]="label()" />
  `,
  styles: `
    :host {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .swatch {
      position: relative;
      flex: none;
      width: 30px;
      height: 30px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .swatch input {
      position: absolute;
      inset: -6px;
      width: calc(100% + 12px);
      height: calc(100% + 12px);
      opacity: 0;
      cursor: pointer;
    }
    .swatch:focus-within {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }
    .input {
      text-transform: uppercase;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class ColorPickerComponent {
  readonly control = input.required<FormControl>();
  /** Current colour, used to paint the swatch. */
  readonly value = input<string>('');
  readonly label = input('Color');
  readonly key = input('');

  protected readonly safe = computed(() => (HEX.test(this.value()) ? this.value() : '#64748b'));

  protected pick(event: Event): void {
    const control = this.control();
    control.setValue((event.target as HTMLInputElement).value.toUpperCase());
    control.markAsDirty();
  }
}
