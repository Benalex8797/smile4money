import express from 'express';
import dotenv from 'dotenv';
import healthRouter from './routes/health.js';
import matchRouter from './routes/matches.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use('/health', healthRouter);
app.use('/api/matches', matchRouter);

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`smile4money-backend listening on http://localhost:${port}`);
});

export default app;
