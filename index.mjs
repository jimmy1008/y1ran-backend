// backend/index.mjs
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import pool from './db/client.mjs'; // 🆕 引入剛剛做的 Postgres client

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 根路由：只確認服務本身
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'y1ran backend root',
  });
});

// 健康檢查：不碰 DB
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'backend alive' });
});

// 🆕 DB 檢查：實際對 Postgres 下 SELECT NOW()
app.get('/db-check', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    const now = result.rows[0]?.now;

    res.json({
      status: 'ok',
      db: 'connected',
      now,
    });
  } catch (err) {
    console.error('DB check error:', err);
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
