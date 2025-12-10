import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'backend alive' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('API server running on port ' + port);
});
