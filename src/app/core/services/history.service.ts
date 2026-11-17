import { Injectable, computed, signal } from '@angular/core';

const LIMIT = 200;

/**
 * Generic undo / redo stack of immutable snapshots.
 * The warehouse store only replaces objects it changes, so snapshots share structure and stay cheap.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService<T> {
  private readonly undoStack = signal<T[]>([]);
  private readonly redoStack = signal<T[]>([]);

  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);

  /** Records the state that existed before a change. */
  push(previous: T): void {
    this.undoStack.update((s) => [...s.slice(-(LIMIT - 1)), previous]);
    this.redoStack.set([]);
  }

  /** Returns the state to restore, or null when there is nothing to undo. */
  undo(current: T): T | null {
    const stack = this.undoStack();
    if (!stack.length) return null;
    this.undoStack.set(stack.slice(0, -1));
    this.redoStack.update((s) => [...s, current]);
    return stack[stack.length - 1];
  }

  redo(current: T): T | null {
    const stack = this.redoStack();
    if (!stack.length) return null;
    this.redoStack.set(stack.slice(0, -1));
    this.undoStack.update((s) => [...s, current]);
    return stack[stack.length - 1];
  }

  clear(): void {
    this.undoStack.set([]);
    this.redoStack.set([]);
  }
}
