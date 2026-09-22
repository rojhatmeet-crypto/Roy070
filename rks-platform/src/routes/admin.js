// Beheer voor RKS: alles bij elkaar onder /beheer, alleen voor beheerders.
import { Router } from 'express';
import { requireRole } from '../auth.js';
import { dashboardRoute } from './admin/dashboard.js';
import * as uren from './admin/uren.js';
import * as facturen from './admin/facturen.js';
import * as plaatsingen from './admin/plaatsingen.js';
import * as zzpers from './admin/zzpers.js';
import * as klanten from './admin/klanten.js';
import * as instellingen from './admin/instellingen.js';

export default function adminRoutes(db) {
  const r = Router();
  r.use(requireRole('admin'));
  r.get('/', dashboardRoute(db));
  uren.register(r, db);
  facturen.register(r, db);
  plaatsingen.register(r, db);
  zzpers.register(r, db);
  klanten.register(r, db);
  instellingen.register(r, db);
  return r;
}
