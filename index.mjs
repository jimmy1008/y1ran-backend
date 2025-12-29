// backend/index.mjs
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db/client.mjs';
import { supabaseAdmin } from './lib/supabase.mjs';

const app = express();

// 基本設定
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET is not set. JWT features will not work.');
}

app.use(cors());
app.use(express.json());

app.get('/api/profile', (req, res) => {
  res.json({ ok: true, where: 'api/profile', ts: Date.now() });
});

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
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';

  const [, token] = authHeader.split(' '); // "Bearer xxx"

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Missing token' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    console.error('JWT verify failed:', err);
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }
}

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
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { data: existing, error: qErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (qErr) {
      return res.status(500).json({ message: qErr.message });
    }

    if (existing) {
      return res.json(existing);
    }

    const payload = {
      id: user.id,
      display_name: '',
      avatar_url: '',
      provider: user.provider ?? '',
      email: user.email ?? '',
    };

    const { data: created, error: iErr } = await supabaseAdmin
      .from('profiles')
      .insert(payload)
      .select('*')
      .single();

    if (iErr) {
      return res.status(500).json({ message: iErr.message });
    }

    return res.json(created);
  } catch (err) {
    console.error('Profile GET error:', err);
    return res.status(500).json({
      message: err?.message ?? String(err),
    });
  }
});

// ----------------------
//  Profile: 更新
// ----------------------
app.put('/api/profile', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { display_name, avatar_url } = req.body || {};
    const safeDisplay =
      typeof display_name === 'string' ? display_name.slice(0, 50) : '';
    const safeAvatar =
      typeof avatar_url === 'string' ? avatar_url.slice(0, 500) : '';

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        display_name: safeDisplay,
        avatar_url: safeAvatar,
      })
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.json(data);
  } catch (err) {
    console.error('Profile PUT error:', err);
    return res.status(500).json({
      message: err?.message ?? String(err),
    });
  }
});

// 啟動 server
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
