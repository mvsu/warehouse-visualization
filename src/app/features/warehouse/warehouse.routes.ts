import { Routes } from '@angular/router';
import { WarehouseWorkspaceComponent } from './components/warehouse-workspace/warehouse-workspace.component';

/**
 * Routes of the warehouse designer feature.
 * To lazy-load the feature from a host application use:
 *   { path: 'warehouse', loadChildren: () => import('./features/warehouse/warehouse.routes').then((m) => m.WAREHOUSE_ROUTES) }
 */
export const WAREHOUSE_ROUTES: Routes = [{ path: '', component: WarehouseWorkspaceComponent, title: 'Warehouse Designer' }];
