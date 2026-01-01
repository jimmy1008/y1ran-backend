// backend/index.mjs
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { query } from './db/client.mjs';
import { supabaseAdmin } from './lib/supabase.mjs';
import createAuthIdentitiesRouter from './routes/authIdentities.js';

const app = express();

// 基本設定
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET is not set. JWT features will not work.');
}

const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
app.use(express.json());

const allowlist = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://y1ran.app",
  "https://www.y1ran.app",
];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowlist.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.options("*", cors());

// 簡單 root
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'y1ran backend root' });
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'backend alive' });
});

// DB 檢查
app.get('/db-check', async (req, res) => {
  try {
    const result = await query('SELECT NOW() as now');
    res.json({ status: 'ok', db: 'connected', now: result.rows[0].now });
  } catch (err) {
    console.error('DB check failed:', err);
    res.status(500).json({
      status: 'error',
      db: 'failed',
      error: err.message ?? String(err),
    });
  }
});

// 產生 JWT
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: '7d' } // 你之後要改期限再說
  );
}

// 驗證 JWT 的中介層
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split(' ');

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Missing token' });
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);

  if (error || !data?.user) {
    console.error('Supabase auth.getUser failed:', error);
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }

  req.user = { id: data.user.id, email: data.user.email };
  next();
}

const authIdentitiesRouter = createAuthIdentitiesRouter(authMiddleware);
app.use('/api/auth', authIdentitiesRouter);
console.log('[routes] /api/auth/oauth-linked (GET), /api/auth/oauth-link (POST) mounted');

// ----------------------
//  Auth: 註冊
// ----------------------
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ status: 'error', message: 'email and password are required' });
    }

    // 檢查是否已存在
    const existing = await query('SELECT id FROM users WHERE email = $1', [
      email,
    ]);

    if (existing.rows.length > 0) {
      return res
        .status(409)
        .json({ status: 'error', message: 'Email already registered' });
    }

    // 雜湊密碼
    const passwordHash = await bcrypt.hash(password, 10);

    // 寫入 DB
    const insertResult = await query(
      `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email, created_at
      `,
      [email, passwordHash]
    );

    const user = insertResult.rows[0];

    const token = signToken(user);

    res.status(201).json({
      status: 'ok',
      user,
      token,
    });
  } catch (err) {
    console.error('Register error:', err);
    res
      .status(500)
      .json({ status: 'error', message: 'Internal error', error: err.message });
  }
});

// ----------------------
//  Auth: 登入
// ----------------------
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ status: 'error', message: 'email and password are required' });
    }

    const result = await query(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ status: 'error', message: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res
        .status(401)
        .json({ status: 'error', message: 'Invalid email or password' });
    }

    const token = signToken(user);

    // 不把 hash 丟回前端
    delete user.password_hash;

    res.json({
      status: 'ok',
      user,
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res
      .status(500)
      .json({ status: 'error', message: 'Internal error', error: err.message });
  }
});

// ----------------------
//  取得自己的資料 /me
// ----------------------
app.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: 'error', message: 'User not found' });
    }

    res.json({ status: 'ok', user: result.rows[0] });
  } catch (err) {
    console.error('/me error:', err);
    res
      .status(500)
      .json({ status: 'error', message: 'Internal error', error: err.message });
  }
});

// ----------------------
//  Profile: 取得 / 建立
// ----------------------
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const { email } = req.user;
    if (!email) {
      return res.status(400).json({ error: 'Missing email in token' });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!profile) {
      const { data: created, error: insertErr } = await supabaseAdmin
        .from('profiles')
        .insert({
          email,
          display_name: '',
          avatar_url: '',
        })
        .select('*')
        .single();

      if (insertErr) {
        return res.status(500).json({ error: insertErr.message });
      }

      return res.json(created);
    }

    return res.json(profile);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.put('/api/profile', authMiddleware, async (req, res) => {
  try {
    const { email } = req.user;
    const { display_name, avatar_url } = req.body || {};

    const patch = {};
    if (typeof display_name === 'string') patch.display_name = display_name;
    if (typeof avatar_url === 'string') patch.avatar_url = avatar_url;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(patch)
      .eq('email', email)
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 啟動 server
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});




