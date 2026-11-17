import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(message: string, tone: Toast['tone'] = 'info'): void {
    const id = ++this.seq;
    this.toasts.update((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => this.toasts.update((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 5000 : 2800);
  }
}
