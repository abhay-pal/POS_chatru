import { getSetting } from './db.js';

export const DEFAULT_PERMS = {
  owner: ['*'],
  manager: [
    'dashboard', 'pos', 'sales_history', 'customers', 'udhaar', 'products', 'categories',
    'inventory', 'raw_materials', 'purchases', 'suppliers', 'expenses', 'wastage',
    'reports', 'finance', 'shift', 'refund', 'cancel_bill', 'large_discount',
    'price_change', 'stock_adjust', 'receive_udhaar'
  ],
  cashier: ['dashboard', 'pos', 'sales_history', 'customers', 'udhaar', 'shift', 'receive_udhaar']
};

export function permsFor(role) {
  const overrides = getSetting('role_permissions', null);
  return (overrides && overrides[role]) || DEFAULT_PERMS[role] || [];
}

export const hasPerm = (user, p) => {
  const perms = permsFor(user.role);
  return perms.includes('*') || perms.includes(p);
};

export function requirePerm(p) {
  return (req, res, next) => {
    if (hasPerm(req.user, p)) return next();
    res.status(403).json({ error: `Permission required: ${p}. Ask a Manager/Owner.`, perm: p });
  };
}
