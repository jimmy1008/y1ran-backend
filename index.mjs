import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ 新增 root route，解決 Cannot GET /
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'y1ran backend root',
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'backend alive' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
