import { Routes } from '@angular/router';
import { WAREHOUSE_ROUTES } from './features/warehouse/warehouse.routes';

export const routes: Routes = [
  { path: '', children: WAREHOUSE_ROUTES },
  { path: '**', redirectTo: '' },
];
