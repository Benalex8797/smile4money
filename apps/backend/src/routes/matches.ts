import { Router } from 'express';
import { matchStore } from '../store/index.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const store = matchStore;

router.use(authenticate);

router.post('/', async (req, res) => {
  const payload = req.body;

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Request body must be JSON' });
  }

  const { player2, stakeAmount, token, gameId, platform } = payload;

  if (!player2 || typeof player2 !== 'string') {
    return res.status(400).json({ error: 'player2 is required' });
  }
  if (typeof stakeAmount !== 'number' || !Number.isFinite(stakeAmount)) {
    return res.status(400).json({ error: 'stakeAmount must be a number' });
  }
  if (stakeAmount <= 0 || stakeAmount > Number.MAX_SAFE_INTEGER) {
    return res.status(400).json({ error: 'stakeAmount must be a valid, positive amount' });
  }
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token is required' });
  }
  if (!gameId || typeof gameId !== 'string' || gameId.length === 0) {
    return res.status(400).json({ error: 'gameId is required' });
  }
  if (gameId.length >= 512) {
    return res.status(400).json({ error: 'gameId is too long' });
  }
  if (!platform || (platform !== 'lichess' && platform !== 'chessdotcom')) {
    return res.status(400).json({ error: 'platform must be lichess or chessdotcom' });
  }

  if (req.address === player2) {
    return res.status(400).json({ error: 'player1 and player2 must be different addresses' });
  }

  try {
    const match = await store.createMatch({
      player1: req.address,
      player2,
      stakeAmount,
      token,
      gameId,
      platform,
    });
    return res.status(201).json(match);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('duplicate')) {
      return res.status(409).json({ error: 'duplicate gameId' });
    }
    return res.status(500).json({ error: message });
  }
});

export default router;
