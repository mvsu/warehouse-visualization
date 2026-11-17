import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

export interface ConfirmationData {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-confirmation-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="confirm surface" role="alertdialog" [attr.aria-label]="data.title">
      <h2>{{ data.title }}</h2>
      <p>{{ data.message }}</p>
      <footer>
        <button type="button" class="btn" (click)="ref.close(false)">Cancel</button>
        <button type="button" class="btn btn-primary" [class.danger]="data.danger" (click)="ref.close(true)">{{ data.confirmLabel }}</button>
      </footer>
    </div>
  `,
  styles: `
    .confirm {
      width: 380px;
      max-width: 100%;
      padding: 20px;
      box-shadow: var(--shadow-pop);
    }
    h2 {
      margin: 0 0 6px;
      font-size: 15px;
      font-weight: 600;
    }
    p {
      margin: 0 0 18px;
      color: var(--text-2);
    }
    footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .danger {
      background: var(--danger);
      border-color: var(--danger);
    }
    .danger:hover {
      background: #b91c1c !important;
    }
  `,
})
export class ConfirmationDialogComponent {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<ConfirmationData>(DIALOG_DATA);
}
