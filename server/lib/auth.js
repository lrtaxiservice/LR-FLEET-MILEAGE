import bcrypt from 'bcrypt';
import { forbidden, HttpError } from './http.js';

export const ROLES = ['ADMIN', 'KM_USER', 'FUEL_USER', 'DOCS_USER', 'VIEWER'];
export const ROLE_LABEL = {
  ADMIN: 'Admin',
  KM_USER: 'KM user',
  FUEL_USER: 'Fuel user',
  DOCS_USER: 'Documents user',
  VIEWER: 'Viewer',
};

export const hashPassword = (p) => bcrypt.hash(p, 12);
export const checkPassword = (p, hash) => bcrypt.compare(p, hash);

/** What each role may do. The Admin may do everything. */
const CAN = {
  km: ['KM_USER'],
  fuel: ['FUEL_USER'],
  reports: ['KM_USER', 'FUEL_USER', 'DOCS_USER', 'VIEWER'],
  vehicles: ['KM_USER', 'FUEL_USER', 'DOCS_USER', 'VIEWER'],
};
export function can(user, what) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return (CAN[what] || []).includes(user.role);
}

export function requireLogin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please log in.'));
  if (req.user.mustChangePassword && !req.path.startsWith('/auth/')) {
    return next(new HttpError(403, 'Please change your password first.'));
  }
  next();
}

export const requireAdmin = (req, _res, next) => next(req.user?.role === 'ADMIN' ? undefined : forbidden('Only the Admin can do this.'));
export const requireCan = (what) => (req, _res, next) => next(can(req.user, what) ? undefined : forbidden());

export const publicUser = (u) => u && {
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
  active: u.active,
  mustChangePassword: u.mustChangePassword,
  createdAt: u.createdAt,
};
