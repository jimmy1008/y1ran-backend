// backend/db/client.mjs
import pkg from 'pg';

const { Pool } = pkg;

// 沒有設定 DATABASE_URL 的時候，給一個警告（方便除錯）
if (!process.env.DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL is not set. Postgres will not work.');
}

// 建立連線池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false } // Railway 上要這樣
    : false,
});

// 這個就是給 index.mjs 用的 named export：query
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('executed query', { text, duration, rows: res.rowCount });
  return res;
}

// 如果你之後想在別的地方用整個 pool，可以用 default export
export default pool;
