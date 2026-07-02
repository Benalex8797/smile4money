import express from 'express';
import healthRouter from './routes/health.js';
import matchRouter from './routes/matches.js';

export const app = express();
app.use(express.json());
app.use('/health', healthRouter);
app.use('/api/matches', matchRouter);

export default app;
