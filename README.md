# Warehouse Designer

Warehouse visualization and space planning on an infinite canvas, built with Angular 22
(standalone components, signals, zoneless change detection).

It combines a Miro-style canvas, Figma-style selection and inspector, CAD-style coordinate rulers
and WMS concepts (racks with addressable cells, zones, aisles, docks).

## Run it

```bash
npm install
npm start            # http://localhost:4200
npm run build        # production build in dist/warehouse-designer
```

Requires Node 22.22+ (or 24.15+), as mandated by Angular 22. No backend is needed: the app starts
with a sample distribution centre, uses mock WMS data and stores layouts in the browser (IndexedDB,
with a localStorage fallback).

## What is in the box

| Area          | Details                                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas engine | Configurable pixel grid and warehouse range up to 20,000 × 20,000 px, zoom 5%–500% towards the cursor, direct wheel/trackpad scrolling, native scrollbars, middle-button/hand-tool panning, viewport culling, level-of-detail rack rendering    |
| Rulers        | Horizontal and vertical rulers driven by the same transform as the canvas; tick intervals are computed from pixel spacing so labels never overlap; pointer marker, selection extent band, crosshair, live X/Y read-out                          |
| Objects       | Racks, grid-aligned walls, automatic Space Groups, spaces, aisles, loading docks, doors, columns, workstations, conveyors, forklift parking, fire exits, restricted areas, staircases, elevators, text, measurements, shapes, floor-plan images |
| Racks         | "Create new rack" with live preview, or "Map existing rack" against a mock WMS API. Rows × columns generate individually addressable cells (`RACK-001-R01-C01`); each cell has a position ID, status, SKU and capacity                          |
| Space Groups  | Multi-select racks to generate a linked wall boundary with configurable rack spacing, wall clearance and thickness; boundaries update automatically as member racks change                                                                      |
| Editing       | Select, shift-click, drag-select, move, resize non-rack objects, rotate, snap to grid and to objects with alignment guides, copy/paste, duplicate, group, lock, z-order, align/distribute, arrow-key nudge, undo/redo                           |
| Inspector     | Generated from a declarative schema with Reactive Forms; edits reach the canvas immediately; multi-selection shows shared properties                                                                                                            |
| Layers        | Show/hide, lock, rename, drag to reorder, select all on a layer                                                                                                                                                                                 |
| Persistence   | Auto-save, multiple warehouses (create, rename, duplicate, delete), JSON import/export, PNG / SVG / PDF export, floor-plan image and SVG import as a scalable background                                                                        |

## Architecture

```
src/app/
  core/
    services/
      canvas-viewport.service.ts   camera: zoom, offset, worldToScreen / screenToWorld, fit, clamp
      canvas-renderer.service.ts   stateless Canvas 2D painter (grid, objects, selection, overlays)
      coordinate.service.ts        grid step, ruler intervals, snapping maths
      history.service.ts           generic undo / redo stack of immutable snapshots
      warehouse-storage.service.ts IndexedDB / localStorage persistence
      warehouse-api.service.ts     REST façade for warehouses and layouts (mock for now)
      rack-api.service.ts          REST façade for WMS racks (mock for now)
      export.service.ts            PNG, SVG, PDF and file download
      toast.service.ts
    utils/                         geometry, resize handles, ruler painter (pure functions)
  shared/components/               icon, toolbar-button, property-field, color-picker, confirmation-dialog
  features/warehouse/
    models/                        typed interfaces + object-schema.ts (one definition per object type)
    services/
      warehouse.service.ts         document store: objects, layers, history, save/load
      object-selection.service.ts  selected ids and selected rack cell
      rack.service.ts              rack geometry and cell generation
      tool.service.ts              active tool, creation settings, snapping options, overlays
      editor-actions.service.ts    commands shared by top bar, toolbars, context menu, shortcuts
    tools/                         select, pan, placement (rect), rack, space, aisle, wall, measurement
    components/                    workspace, topbar, toolbar, canvas, rulers, coordinate indicator,
                                   zoom controls, contextual toolbar, properties panel, layer panel,
                                   rack dialog, rack preview
    warehouse.routes.ts
```

Design decisions worth knowing:

- **One coordinate system.** `screen = world × scale + offset`. The canvas, rulers, grid, hit-testing
  and every tool go through `CanvasViewportService`, so they cannot drift apart. Objects only ever
  store world coordinates; zooming never touches their dimensions.
- **Fixed rack geometry.** Rack cells store their world-pixel width, height and relative position.
  The rack footprint is derived from its cell configuration, racks have no resize handles, and a
  grid-settings change rebuilds existing racks so each cell fits one newly configured grid cell.
- **Rendering is separate from Angular.** `CanvasRendererService` receives a plain scene object and
  draws it. The canvas component repaints at most once per animation frame when a signal changes.
- **Dedicated Canvas 2D renderer instead of Konva.** It keeps full control over culling, level of
  detail and grid/ruler alignment with no extra dependency.
- **Immutable document state.** Every change creates new objects, which makes undo snapshots cheap
  (structural sharing) and signal updates precise.
- **Schema-driven UI.** `object-schema.ts` describes each object type once (defaults, ID prefix,
  layer, fields). The creation panel, the inspector and the object factory are all generated from it.
  Adding a property is a one-line change; adding an object type is one schema entry plus one painter.

### Scale

At 100% zoom the complete 2,000 × 2,000 px default area fits the available viewport with equal X/Y
scaling. Grid Settings defines the logical cell width and height, warehouse coordinate range,
visibility and snapping. Zooming and scrolling transform that same rectangular grid without adding
subdivisions. When snapping is enabled, object boundaries use the configured cell dimensions.

## Connecting a real WMS

1. Set `USE_MOCK_API = false` in `core/services/warehouse-api.service.ts`.
2. Point `API_BASE_URL` at your gateway. The expected endpoints are documented on each method:
   `GET /racks`, `GET /racks/:id`, `POST /racks/:id/mapping`, `GET|PUT|DELETE /layouts/:id`.
3. For server-side layouts, replace the bodies of `WarehouseStorageService` with calls to
   `WarehouseApiService` (the store only depends on `list / get / save / delete`).

## Keyboard shortcuts

| Key                   | Action                        | Key           | Action                   |
| --------------------- | ----------------------------- | ------------- | ------------------------ |
| V                     | Select                        | H             | Hand / pan               |
| R W S A               | Rack, wall, space, aisle      | D O C         | Dock, door, column       |
| T M P                 | Text, measurement, shape      | L             | Layers                   |
| Mouse wheel           | Vertical scroll               | Shift + wheel | Horizontal scroll        |
| Trackpad              | Horizontal / vertical scroll  | Ctrl + wheel  | Zoom at cursor           |
| Ctrl C / V / D        | Copy, paste, duplicate        | Delete        | Delete selection         |
| Ctrl Z / Ctrl Shift Z | Undo / redo                   | Ctrl S        | Save                     |
| Ctrl G / Ctrl Shift G | Group / ungroup               | Ctrl L        | Lock / unlock            |
| Ctrl A                | Select all                    | Arrow keys    | Nudge 1 unit (Shift: 10) |
| ] / [                 | Bring to front / send to back | + / −         | Zoom in / out            |
| Shift 1 / Shift 2     | Fit selection / fit warehouse | Esc           | Cancel, back to Select   |

While drawing: `Shift` constrains (axis when moving, aspect ratio when resizing, 15° steps when
rotating or drawing walls). Use Shift-click or Ctrl/Command-click to add or remove objects from the
selection. Grid snapping is controlled from Grid Settings or the status bar.
Shortcuts are ignored while typing in a field.

## Known limits

- Zones are rectangles (with optional corner radius); free-form polygon zones are not implemented.
- Imported SVG files are placed as a scalable background image, not converted into editable objects.
- PDF export embeds the drawing as an image on a single A4 page.
- Sharing copies the layout JSON; there is no multi-user backend.

See `COMPATIBILITY.md` for the supported Angular versions (17.2 to 22) and how to switch between them.
