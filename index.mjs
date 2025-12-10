// backend/index.mjs
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { query } from './db/client.mjs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 根路由（方便你之後測）
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'y1ran backend root' });
});

// 健康檢查（不碰 DB）
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'backend alive' });
});

// DB 連線檢查
app.get('/db-check', async (req, res) => {
  try {
    const result = await query('SELECT NOW() AS now;');
    res.json({
      status: 'ok',
      db: 'connected',
      now: result.rows[0].now,
    });
  } catch (err) {
    console.error('DB check failed:', err);
    res.status(500).json({
      status: 'error',
      db: 'failed',
      error: err.message,
    });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
