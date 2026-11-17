import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CanvasRendererService } from '../../../../core/services/canvas-renderer.service';
import { CanvasViewportService } from '../../../../core/services/canvas-viewport.service';
import { ObjectSelectionService } from '../../services/object-selection.service';
import { ViewModeService } from '../../services/view-mode.service';
import { ToolService } from '../../services/tool.service';
import { WarehouseService } from '../../services/warehouse.service';
import { ToolPointerEvent } from '../../tools/tool.model';

/**
 * The drawing surface. It owns no document state: it forwards pointer input to the active tool
 * and repaints (at most once per animation frame) whenever a signal it depends on changes.
 */
@Component({
  standalone: true,
  selector: 'app-warehouse-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #scroller class="scroller" (scroll)="onScroll()">
      <div
        class="scroll-surface"
        [style.width.px]="scrollWidth()"
        [style.height.px]="scrollHeight()"
      ></div>
    </div>
    <canvas
      #canvas
      tabindex="0"
      aria-label="Warehouse canvas. Use the toolbar to add objects; drag to move them."
      [style.cursor]="cursor()"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
      (pointerleave)="onPointerLeave()"
      (wheel)="onWheel($event)"
      (dblclick)="onDoubleClick($event)"
      [style.width.px]="viewportWidth()"
      [style.height.px]="viewportHeight()"
    ></canvas>
  `,
  styles: `
    :host {
      display: block;
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: var(--canvas);
    }
    .scroller {
      position: absolute;
      inset: 0;
      overflow: scroll;
      overscroll-behavior: contain;
      scrollbar-color: #94a3b8 #e2e8f0;
      scrollbar-width: auto;
    }
    .scroll-surface {
      pointer-events: none;
    }
    canvas {
      position: absolute;
      z-index: 1;
      top: 0;
      left: 0;
      display: block;
      touch-action: none;
      outline: none;
    }
  `,
})
export class WarehouseCanvasComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly viewport = inject(CanvasViewportService);
  private readonly renderer = inject(CanvasRendererService);
  private readonly store = inject(WarehouseService);
  private readonly selection = inject(ObjectSelectionService);
  private readonly tools = inject(ToolService);
  private readonly view = inject(ViewModeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly scrollerRef = viewChild.required<ElementRef<HTMLDivElement>>('scroller');

  private readonly panning = signal(false);
  private readonly domReady = signal(false);
  private panFrom: { x: number; y: number } | null = null;
  private toolActive = false;
  private frame = 0;

  protected readonly viewportWidth = this.viewport.viewportWidth;
  protected readonly viewportHeight = this.viewport.viewportHeight;
  protected readonly scrollWidth = computed(() =>
    Math.max(
      this.viewport.viewportWidth(),
      Math.ceil(this.viewport.worldWidth() * this.viewport.scale()),
    ),
  );
  protected readonly scrollHeight = computed(() =>
    Math.max(
      this.viewport.viewportHeight(),
      Math.ceil(this.viewport.worldHeight() * this.viewport.scale()),
    ),
  );

  protected readonly cursor = computed(() => {
    if (this.panning()) return 'grabbing';
    if (this.tools.activeToolId() === 'pan') return 'grab';
    return this.tools.cursor() ?? this.tools.activeTool().cursor;
  });

  constructor() {
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(this.host.nativeElement);
      this.domReady.set(true);
      this.resize();
      this.destroyRef.onDestroy(() => {
        observer.disconnect();
        cancelAnimationFrame(this.frame);
      });
    });

    // Every signal read here is a repaint trigger.
    effect(() => {
      this.viewport.transform();
      this.viewport.viewportWidth();
      this.viewport.viewportHeight();
      this.store.renderList();
      this.store.selected();
      this.store.editMode();
      this.selection.cellId();
      this.view.focus();
      this.tools.showGrid();
      this.tools.gridCellWidth();
      this.tools.gridCellHeight();
      this.renderer.imageTick();
      if (this.tools.overlay().draftLabel) this.viewport.mouseScreen();
      this.schedule();
    });

    // Keep native scrollbar thumbs synchronized with programmatic pan, zoom and fit commands.
    effect(() => {
      if (!this.domReady()) return;
      const left = Math.max(0, -this.viewport.offsetX());
      const top = Math.max(0, -this.viewport.offsetY());
      const scroller = this.scrollerRef().nativeElement;
      if (Math.abs(scroller.scrollLeft - left) > 0.5) scroller.scrollLeft = left;
      if (Math.abs(scroller.scrollTop - top) > 0.5) scroller.scrollTop = top;
    });
  }

  private resize(): void {
    const scroller = this.scrollerRef().nativeElement;
    this.viewport.setViewportSize(scroller.clientWidth, scroller.clientHeight);
    this.store.applyPendingView();
    this.schedule();
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw(): void {
    const canvas = this.canvasRef().nativeElement;
    const width = this.viewport.viewportWidth();
    const height = this.viewport.viewportHeight();
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.renderer.render(ctx, {
      width,
      height,
      dpr,
      transform: this.viewport.transform(),
      objects: this.store.renderList(),
      selection: this.store.selected(),
      selectedCellId: this.selection.cellId(),
      focus: this.view.focus(),
      overlay: this.tools.overlay(),
      showGrid: this.tools.showGrid(),
      gridCellWidth: this.tools.gridCellWidth(),
      gridCellHeight: this.tools.gridCellHeight(),
      worldWidth: this.viewport.worldWidth(),
      worldHeight: this.viewport.worldHeight(),
      showHandles: this.store.editMode(),
      mouse: this.viewport.mouseScreen(),
    });
  }

  private toToolEvent(ev: MouseEvent): ToolPointerEvent {
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const screen = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    return {
      screen,
      world: this.viewport.screenToWorld(screen.x, screen.y),
      shift: ev.shiftKey,
      alt: ev.altKey,
      ctrl: ev.ctrlKey || ev.metaKey,
      button: ev.button,
    };
  }

  protected onPointerDown(ev: PointerEvent): void {
    const canvas = this.canvasRef().nativeElement;
    // Commit any in-progress text edit and return keyboard focus to the canvas.
    if (document.activeElement instanceof HTMLElement && document.activeElement !== canvas)
      document.activeElement.blur();
    const e = this.toToolEvent(ev);
    this.viewport.mouseScreen.set(e.screen);

    const panGesture = ev.button === 1 || (ev.button === 0 && this.tools.activeToolId() === 'pan');
    if (panGesture) {
      ev.preventDefault();
      canvas.setPointerCapture(ev.pointerId);
      this.panFrom = { x: ev.clientX, y: ev.clientY };
      this.panning.set(true);
      return;
    }
    if (ev.button === 2) {
      this.tools.activeTool().onContextMenu?.(e);
      return;
    }
    if (ev.button !== 0) return;
    canvas.setPointerCapture(ev.pointerId);
    this.toolActive = true;
    this.tools.activeTool().onPointerDown(e);
  }

  protected onPointerMove(ev: PointerEvent): void {
    const e = this.toToolEvent(ev);
    this.viewport.mouseScreen.set(e.screen);
    if (this.panFrom) {
      this.viewport.panCanvas(ev.clientX - this.panFrom.x, ev.clientY - this.panFrom.y);
      this.panFrom = { x: ev.clientX, y: ev.clientY };
      return;
    }
    this.tools.activeTool().onPointerMove(e);
  }

  protected onPointerUp(ev: PointerEvent): void {
    const canvas = this.canvasRef().nativeElement;
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
    if (this.panFrom) {
      this.panFrom = null;
      this.panning.set(false);
      return;
    }
    if (!this.toolActive) return;
    this.toolActive = false;
    this.tools.activeTool().onPointerUp(this.toToolEvent(ev));
  }

  protected onPointerLeave(): void {
    if (this.toolActive || this.panFrom) return;
    this.viewport.mouseScreen.set(null);
    // Hide the placement ghost while the pointer is away from the canvas.
    if (this.tools.creationType() && this.tools.overlay().draft)
      this.tools.patchOverlay({ draft: null, draftLabel: null });
    this.tools.cursor.set(null);
  }

  /** Plain wheel/trackpad input scrolls; Ctrl/Command + wheel zooms towards the pointer. */
  protected onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const unit =
      ev.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : ev.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? this.viewport.viewportHeight()
          : 1;
    if (ev.ctrlKey || ev.metaKey) {
      const rect = this.canvasRef().nativeElement.getBoundingClientRect();
      const factor = Math.exp(-ev.deltaY * unit * 0.01);
      this.viewport.zoomAtPoint(
        ev.clientX - rect.left,
        ev.clientY - rect.top,
        this.viewport.zoomScale() * factor,
      );
      return;
    }
    const dx = (ev.shiftKey && !ev.deltaX ? ev.deltaY : ev.deltaX) * unit;
    const dy = (ev.shiftKey && !ev.deltaX ? 0 : ev.deltaY) * unit;
    this.viewport.panCanvas(-dx, -dy);
  }

  protected onScroll(): void {
    if (!this.domReady()) return;
    const scroller = this.scrollerRef().nativeElement;
    this.viewport.scrollTo(scroller.scrollLeft, scroller.scrollTop);
  }

  protected onDoubleClick(ev: MouseEvent): void {
    this.tools.activeTool().onDoubleClick?.(this.toToolEvent(ev));
  }
}
