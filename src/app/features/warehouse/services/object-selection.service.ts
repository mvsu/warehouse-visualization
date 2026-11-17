import { Injectable, computed, signal } from '@angular/core';

/** Which objects (and which rack cell) are currently selected. Holds ids only; the store resolves them. */
@Injectable({ providedIn: 'root' })
export class ObjectSelectionService {
  readonly ids = signal<string[]>([]);
  /** Selected cell inside the single selected rack. */
  readonly cellId = signal<string | null>(null);
  readonly count = computed(() => this.ids().length);

  has(id: string): boolean {
    return this.ids().includes(id);
  }

  set(ids: Iterable<string>): void {
    const next = [...new Set(ids)];
    const current = this.ids();
    if (next.length === current.length && next.every((id, i) => id === current[i])) return;
    this.ids.set(next);
    this.cellId.set(null);
  }

  add(ids: Iterable<string>): void {
    this.set([...this.ids(), ...ids]);
  }

  /** Shift-click behaviour: removes the ids when all are selected, otherwise adds them. */
  toggle(ids: string[]): void {
    const current = this.ids();
    if (ids.every((id) => current.includes(id))) this.set(current.filter((id) => !ids.includes(id)));
    else this.add(ids);
  }

  clear(): void {
    this.set([]);
  }

  selectCell(cellId: string | null): void {
    this.cellId.set(cellId);
  }
}
