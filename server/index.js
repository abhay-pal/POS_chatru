import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { get, run } from './db.js';
import { permsFor } from './perm.js';
import { seedIfEmpty } from './seed.js';
import masters from './routes/masters.js';
import salesRoutes from './routes/sales.js';
import ops from './routes/ops.js';
import analytics from './routes/analytics.js';

seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = get('SELECT * FROM users WHERE username = ? AND active = 1', String(username || '').trim().toLowerCase());
  if (!user || user.password !== String(password || '')) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  run('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,datetime())', token, user.id);
  res.json({
    token,
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
    perms: permsFor(user.role)
  });
});

app.use('/api', (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const row = token && get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', token);
  if (!row) return res.status(401).json({ error: 'Not authenticated' });
  req.user = { id: row.id, name: row.name, username: row.username, role: row.role };
  next();
});

app.get('/api/auth/me', (req, res) => res.json({ user: req.user, perms: permsFor(req.user.role) }));

app.use('/api', masters);
app.use('/api', salesRoutes);
app.use('/api', ops);
app.use('/api', analytics);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Something went wrong' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => console.log(`Sweet Shop POS API running on :${PORT}`));
