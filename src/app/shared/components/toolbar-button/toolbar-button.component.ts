import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';

/** Icon button with tooltip, active and disabled states. Used by every toolbar. */
@Component({
  standalone: true,
  selector: 'app-toolbar-button',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="icon-btn"
      [class.active]="active()"
      [class.labelled]="!!text()"
      [disabled]="disabled()"
      [attr.aria-label]="label()"
      [attr.aria-pressed]="toggle() ? active() : null"
      [attr.data-tip]="tip()"
      [attr.data-tip-pos]="tipPosition()"
      (click)="pressed.emit($event)"
    >
      <app-icon [name]="icon()" [size]="size()" />
      @if (text()) {
        <span>{{ text() }}</span>
      }
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .labelled {
      width: auto;
      gap: 6px;
      padding: 0 9px 0 7px;
      font-weight: 500;
      font-size: 12.5px;
      white-space: nowrap;
    }
  `,
})
export class ToolbarButtonComponent {
  readonly icon = input.required<IconName>();
  readonly label = input.required<string>();
  /** Optional visible caption next to the icon. */
  readonly text = input('');
  readonly shortcut = input('');
  readonly active = input(false);
  readonly toggle = input(false);
  readonly disabled = input(false);
  readonly size = input(18);
  readonly tipPosition = input<'bottom' | 'right' | 'top' | 'bottom-end' | 'top-end'>('bottom');
  readonly pressed = output<MouseEvent>();

  protected readonly tip = computed(() => (this.shortcut() ? `${this.label()}   ${this.shortcut()}` : this.text() ? '' : this.label()));
}
