// backend/index.mjs
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { query } from './db/client.mjs';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// 根路由：純測試用
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'root route working',
  });
});

// 健康檢查：只測 API server
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'backend alive',
  });
});

// DB 健康檢查：真的去打 PostgreSQL
app.get('/db-check', async (req, res) => {
  try {
    const result = await query('SELECT NOW()');
    res.json({
      status: 'ok',
      db: 'connected',
      time: result.rows[0],
    });
  } catch (err) {
    // 這行會直接出現在 Railway Logs 裡，之後 debug 全靠這個
    console.error('DB ERROR:', err);

    res.json({
      status: 'error',
      db: 'failed',
      error: err.message, // 這次就不會是空字串了
    });
  }
});

// Railway 一定要用 process.env.PORT
const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
