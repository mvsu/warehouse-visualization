# Warehouse Designer: database tables and API

The app reads and writes the warehouse as plain tables. In mock mode each table is one JSON file in
`public/mock/db/`. With a real backend the same table names become REST resources. The file name,
the URL segment and the TypeScript row interface are the same word, so a backend developer can map
one file to one table.

## Tables

Primary keys end in `Id`. A column named like another table's key is a foreign key to that table.

| Table (file) | Primary key | Foreign keys | Written by the editor | Row interface |
| --- | --- | --- | --- | --- |
| `warehouses` | `warehouseId` | | no | `DbWarehouse` |
| `zones` | `zoneId` | `warehouseId` | no (WMS master data) | `DbZone` |
| `areas` | `areaId` | `warehouseId`, `zoneCode` -> zones.code | no (WMS master data) | `DbArea` |
| `racks` | `rackId` | `warehouseId`, `zoneCode`, `areaCode` -> areas.code | yes | `DbRack` |
| `locations` | `locationId` | `rackId` | yes | `DbLocation` |
| `stock` | `stockId` | `locationId`, `sku` -> items.sku | no (WMS) | `DbStock` |
| `items` | `sku` | | no (WMS) | `DbItem` |
| `aisles` | `aisleId` | `warehouseId` | yes | `DbAisle` |
| `objects` | `objectId` | `warehouseId` | yes | `DbObject` |
| `pickups` | `pickupId` | `warehouseId` | no (WMS) | `DbPickup` |
| `pickup-lines` | `lineId` | `pickupId`, `sku`, `locationId` | no (WMS) | `DbPickupLine` |
| `activity` | `activityId` | `warehouseId`, `sku`, `locationId`, `fromLocationId` | no (WMS) | `DbActivity` |

All row interfaces are in `src/app/features/warehouse/data/db.model.ts`.

Notes on the rows:

- A **location** is one bay level of a rack (`bay` = column, `level` = row). A rack with 28 bays and
  6 levels has 168 location rows.
- **stock** holds one row per item line in a location. The quantity of a level is the sum of its
  stock rows; it is not stored on the location.
- **objects** are the free shapes of the editor. `objectType` is `rectangle`, `circle`, `triangle`
  or `text`. For text, `name` is the text. Shapes use `fillColor`, `borderColor`, `borderWidth`,
  `opacity`; text uses `fontSize`, `bold`, `color`.
- Positions and sizes (`x`, `y`, `width`, `height`) are canvas pixels from the top-left corner.

## REST contract

| Method | URL | Body / result |
| --- | --- | --- |
| GET | `/api/wms/warehouses` | `DbWarehouse[]` |
| GET | `/api/wms/warehouses/:warehouseId/<table>` | rows of that table for the warehouse |
| PUT | `/api/wms/warehouses/:warehouseId/racks` | `DbRack[]` (replaces the rows) |
| PUT | `/api/wms/warehouses/:warehouseId/locations` | `DbLocation[]` |
| PUT | `/api/wms/warehouses/:warehouseId/aisles` | `DbAisle[]` |
| PUT | `/api/wms/warehouses/:warehouseId/objects` | `DbObject[]` |

`<table>` is one of: `zones`, `areas`, `racks`, `locations`, `stock`, `items`, `aisles`, `objects`,
`pickups`, `pickup-lines`, `activity`.

## Where the code is

| What | File |
| --- | --- |
| Row interfaces | `src/app/features/warehouse/data/db.model.ts` |
| Rows <-> canvas layout (`layoutFromDb`, `layoutToDb`) | `src/app/features/warehouse/data/db.mapper.ts` |
| Loading and saving (`load`, `save`) | `src/app/core/services/warehouse-db.service.ts` |
| Mock / real switch (`USE_MOCK_API`, `API_BASE_URL`) | `src/app/core/services/warehouse-api.service.ts` |
| Load on start, save on Save (`loadFromDatabase`, `saveToDatabase`) | `src/app/features/warehouse/services/warehouse.service.ts` |

## Connecting the real database

1. Build the endpoints in the REST contract above. They return and accept the same JSON as the
   files in `public/mock/db/`.
2. In `warehouse-api.service.ts` set `USE_MOCK_API = false` and, if needed, change `API_BASE_URL`.
3. In `warehouse-db.service.ts` set `DEFAULT_WAREHOUSE_ID` to the warehouse to open.

With the real API the app loads the warehouse from the database on every start and writes racks,
locations, aisles and objects back on every save.

## Working with the mock files

The mock files are static, so the app reads them once and keeps later edits in the browser. After
changing a file in `public/mock/db/`, raise `MOCK_DB_VERSION` in `warehouse.service.ts` (for example
`'v1'` to `'v2'`) and refresh the page.
