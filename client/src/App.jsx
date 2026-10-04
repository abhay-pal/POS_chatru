import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, ReceiptText, Users, HandCoins, Package, Tags, Boxes,
  Wheat, Truck, Store, Wallet, Trash2, BarChart3, PieChart, UserCog, Settings as SettingsIcon,
  Menu, LogOut, PanelLeftClose
} from 'lucide-react';
import { api, getToken, setToken } from './api.js';
import { ToastProvider } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import POS from './pages/POS.jsx';
import SalesHistory from './pages/SalesHistory.jsx';
import Customers from './pages/Customers.jsx';
import Udhaar from './pages/Udhaar.jsx';
import Products from './pages/Products.jsx';
import Categories from './pages/Categories.jsx';
import Inventory from './pages/Inventory.jsx';
import RawMaterials from './pages/RawMaterials.jsx';
import Purchases from './pages/Purchases.jsx';
import Suppliers from './pages/Suppliers.jsx';
import Expenses from './pages/Expenses.jsx';
import Wastage from './pages/Wastage.jsx';
import Reports from './pages/Reports.jsx';
import Finance from './pages/Finance.jsx';
import Staff from './pages/Staff.jsx';
import Settings from './pages/Settings.jsx';
import PrintReceipt from './print/Receipt.jsx';
import PrintStatement from './print/Statement.jsx';

// ── auth/app context ──
const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const NAV = [
  { sec: 'Main' },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard', end: true },
  { to: '/pos', label: 'POS / Sale', icon: ShoppingCart, perm: 'pos' },
  { to: '/sales', label: 'Sales History', icon: ReceiptText, perm: 'sales_history' },
  { sec: 'Customers' },
  { to: '/customers', label: 'Customers', icon: Users, perm: 'customers' },
  { to: '/udhaar', label: 'Udhaar', icon: HandCoins, perm: 'udhaar' },
  { sec: 'Catalog & Stock' },
  { to: '/products', label: 'Products', icon: Package, perm: 'products' },
  { to: '/categories', label: 'Categories', icon: Tags, perm: 'categories' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, perm: 'inventory' },
  { to: '/raw-materials', label: 'Raw Materials', icon: Wheat, perm: 'raw_materials' },
  { sec: 'Purchase & Spend' },
  { to: '/purchases', label: 'Purchases', icon: Truck, perm: 'purchases' },
  { to: '/suppliers', label: 'Suppliers', icon: Store, perm: 'purchases' },
  { to: '/expenses', label: 'Expenses', icon: Wallet, perm: 'expenses' },
  { to: '/wastage', label: 'Wastage', icon: Trash2, perm: 'wastage' },
  { sec: 'Insights' },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports' },
  { to: '/finance', label: 'Finance & Analysis', icon: PieChart, perm: 'finance' },
  { sec: 'Admin' },
  { to: '/staff', label: 'Staff & Shifts', icon: UserCog, perm: 'shift' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, perm: '*' }
];

const TITLES = {
  '/': 'Dashboard', '/pos': 'POS / Sale', '/sales': 'Sales History', '/customers': 'Customers',
  '/udhaar': 'Udhaar (Credit)', '/products': 'Products', '/categories': 'Categories',
  '/inventory': 'Inventory', '/raw-materials': 'Raw Materials', '/purchases': 'Purchases',
  '/suppliers': 'Suppliers', '/expenses': 'Expenses', '/wastage': 'Wastage', '/reports': 'Reports',
  '/finance': 'Finance & Analysis', '/staff': 'Staff & Shifts', '/settings': 'Settings'
};

function Layout({ children }) {
  const { user, perms, business, logout, hasPerm } = useApp();
  const [collapsed, setCollapsed] = useState(localStorage.getItem('sb_collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setMobileOpen(false), [loc.pathname]);
  const toggle = () => {
    if (window.innerWidth <= 880) setMobileOpen(o => !o);
    else { setCollapsed(c => { localStorage.setItem('sb_collapsed', c ? '0' : '1'); return !c; }); }
  };
  const title = TITLES[loc.pathname] || business?.name || '';
  return (
    <div className={`app ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'sb-open' : ''}`}>
      <aside className="sidebar" onClick={(e) => { if (mobileOpen && e.target === e.currentTarget) setMobileOpen(false); }}>
        <div className="sb-head">
          <img src={business?.logo || '/logo.png'} alt="logo" />
          <div className="sb-title">
            <b>{business?.name || 'Sweet Shop POS'}</b>
            <span>Sweet Shop POS</span>
          </div>
        </div>
        <nav className="sb-nav">
          {NAV.map((n, i) => n.sec
            ? <div key={i} className="sb-sec">{n.sec}</div>
            : (hasPerm(n.perm) &&
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `sb-item ${isActive ? 'active' : ''}`}>
                <n.icon /><span>{n.label}</span>
              </NavLink>)
          )}
        </nav>
        <div className="sb-foot">
          <button className="sb-item" onClick={logout}><LogOut /><span>Logout ({user?.name?.split(' ')[0]})</span></button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <button className="burger" onClick={toggle}>{collapsed ? <Menu size={18} /> : <PanelLeftClose size={18} />}</button>
          <h1>{title}</h1>
          <div className="top-right">
            <div className="user-chip">
              <div className="avatar">{user?.name?.[0] || '?'}</div>
              <div><b>{user?.name}</b><small>{user?.role}</small></div>
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Protected({ perm, children }) {
  const { user, hasPerm } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  if (perm && !hasPerm(perm)) return <div className="page"><div className="empty"><div className="big">🔒</div>You don't have permission to view this module.</div></div>;
  return children;
}

function Shell() {
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState([]);
  const [business, setBusiness] = useState(null);
  const [booted, setBooted] = useState(false);

  const hasPerm = (p) => !p || perms.includes('*') || perms.includes(p);

  const loadMe = async () => {
    if (!getToken()) { setBooted(true); return; }
    try {
      const me = await api('/auth/me');
      setUser(me.user); setPerms(me.perms);
      setBusiness(await api('/business'));
    } catch { /* token invalid */ }
    setBooted(true);
  };
  useEffect(() => { loadMe(); }, []);

  const login = async (username, password) => {
    const res = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(res.token);
    setUser(res.user); setPerms(res.perms);
    try { setBusiness(await api('/business')); } catch { /* non-fatal; layout falls back to defaults */ }
    return res;
  };
  const logout = () => { setToken(null); setUser(null); setPerms([]); window.location.href = '/login'; };

  const ctx = useMemo(() => ({ user, perms, business, setBusiness, login, logout, hasPerm }), [user, perms, business]);

  if (!booted) return <div className="login-wrap"><div className="muted">Loading…</div></div>;

  return (
    <AppCtx.Provider value={ctx}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/print/receipt/:id" element={<PrintReceipt />} />
        <Route path="/print/statement/:customerId" element={<PrintStatement />} />
        <Route path="*" element={
          <Protected>
            <Layout>
              <Routes>
                <Route path="/" element={<Protected perm="dashboard"><Dashboard /></Protected>} />
                <Route path="/pos" element={<Protected perm="pos"><POS /></Protected>} />
                <Route path="/sales" element={<Protected perm="sales_history"><SalesHistory /></Protected>} />
                <Route path="/customers" element={<Protected perm="customers"><Customers /></Protected>} />
                <Route path="/udhaar" element={<Protected perm="udhaar"><Udhaar /></Protected>} />
                <Route path="/products" element={<Protected perm="products"><Products /></Protected>} />
                <Route path="/categories" element={<Protected perm="categories"><Categories /></Protected>} />
                <Route path="/inventory" element={<Protected perm="inventory"><Inventory /></Protected>} />
                <Route path="/raw-materials" element={<Protected perm="raw_materials"><RawMaterials /></Protected>} />
                <Route path="/purchases" element={<Protected perm="purchases"><Purchases /></Protected>} />
                <Route path="/suppliers" element={<Protected perm="purchases"><Suppliers /></Protected>} />
                <Route path="/expenses" element={<Protected perm="expenses"><Expenses /></Protected>} />
                <Route path="/wastage" element={<Protected perm="wastage"><Wastage /></Protected>} />
                <Route path="/reports" element={<Protected perm="reports"><Reports /></Protected>} />
                <Route path="/finance" element={<Protected perm="finance"><Finance /></Protected>} />
                <Route path="/staff" element={<Protected perm="shift"><Staff /></Protected>} />
                <Route path="/settings" element={<Protected perm="*"><Settings /></Protected>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </Protected>
        } />
      </Routes>
    </AppCtx.Provider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </ToastProvider>
  );
}
