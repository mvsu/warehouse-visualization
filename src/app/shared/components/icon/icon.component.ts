import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { IconNode } from 'lucide';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowLeftRight,
  BringToFront,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Columns2,
  Copy,
  CopyPlus,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileBraces,
  FileImage,
  FilePlus,
  FileText,
  Focus,
  FolderOpen,
  Forklift,
  Grid2x2,
  Grid3x3,
  GripVertical,
  Group,
  Hand,
  Image,
  Info,
  Layers,
  Link,
  Lock,
  LockOpen,
  Magnet,
  Maximize,
  Minus,
  MousePointer2,
  Package,
  PanelRightClose,
  Pencil,
  Plus,
  Redo2,
  Save,
  Scan,
  Search,
  SendToBack,
  Shapes,
  Share2,
  Square,
  SquareDashed,
  Trash,
  Type,
  Undo2,
  Ungroup,
  Upload,
  Warehouse,
  X,
} from 'lucide';

/** Application icon vocabulary. Components reference icons by role so the icon set can be swapped in one place. */
const ICONS = {
  select: MousePointer2,
  pan: Hand,
  rack: Grid3x3,
  space: SquareDashed,
  aisle: ArrowLeftRight,
  column: Columns2,
  text: Type,
  shape: Shapes,
  layers: Layers,
  storage: Package,
  forklift: Forklift,
  image: Image,
  square: Square,
  logo: Warehouse,
  save: Save,
  undo: Undo2,
  redo: Redo2,
  import: Upload,
  export: Download,
  edit: Pencil,
  view: Eye,
  hidden: EyeOff,
  share: Share2,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  plus: Plus,
  minus: Minus,
  'fit-screen': Maximize,
  'fit-warehouse': Scan,
  lock: Lock,
  unlock: LockOpen,
  copy: Copy,
  paste: ClipboardPaste,
  duplicate: CopyPlus,
  trash: Trash,
  group: Group,
  ungroup: Ungroup,
  front: BringToFront,
  back: SendToBack,
  close: X,
  check: Check,
  search: Search,
  grip: GripVertical,
  'file-json': FileBraces,
  'file-image': FileImage,
  'file-text': FileText,
  'file-plus': FilePlus,
  folder: FolderOpen,
  'align-left': AlignStartVertical,
  'align-center-h': AlignCenterVertical,
  'align-right': AlignEndVertical,
  'align-top': AlignStartHorizontal,
  'align-center-v': AlignCenterHorizontal,
  'align-bottom': AlignEndHorizontal,
  'distribute-h': AlignHorizontalSpaceAround,
  'distribute-v': AlignVerticalSpaceAround,
  magnet: Magnet,
  grid: Grid2x2,
  crosshair: Crosshair,
  link: Link,
  info: Info,
  focus: Focus,
  collapse: PanelRightClose,
} as const;

export type IconName = keyof typeof ICONS;

@Component({
  standalone: true,
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [innerHTML]="svg()"></span>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(18);
  readonly strokeWidth = input(1.75);

  private readonly sanitizer = inject(DomSanitizer);

  /** Inline SVG built from the static Lucide icon data, so it works on every Angular version. */
  protected readonly svg = computed(() => {
    const nodes = ICONS[this.name()] as IconNode;
    const body = nodes
      .map(([tag, attrs]) => {
        const a = Object.entries(attrs)
          .map(([k, v]) => `${k}="${String(v)}"`)
          .join(' ');
        return `<${tag} ${a}/>`;
      })
      .join('');
    const px = this.size();
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${this.strokeWidth()}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`,
    );
  });
}
