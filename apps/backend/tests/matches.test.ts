import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import matchRouter from '../src/routes/matches.js';
import jwt from 'jsonwebtoken';

const secret = 'test-secret';
const makeToken = (address = 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') =>
  jwt.sign({ address }, secret, { expiresIn: '1h' });

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/matches', matchRouter);
  return app;
};

describe('POST /api/matches', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const response = await request(app).post('/api/matches').send({});
    expect(response.status).toBe(401);
  });

  it('returns 401 when the JWT is malformed', async () => {
    const response = await request(app)
      .post('/api/matches')
      .set('Authorization', 'Bearer invalid.token')
      .send({});
    expect(response.status).toBe(401);
  });

  it('returns 400 when player2 is missing', async () => {
    const response = await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ stakeAmount: 100, token: 'XLM', gameId: 'lichess-game-abc123', platform: 'lichess' });
    expect(response.status).toBe(400);
  });

  it('returns 400 when stakeAmount is missing', async () => {
    const response = await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ player2: 'GPLAYER2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', token: 'XLM', gameId: 'lichess-game-abc123', platform: 'lichess' });
    expect(response.status).toBe(400);
  });

  it('returns 400 when stakeAmount is zero', async () => {
    const response = await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ player2: 'GPLAYER2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', stakeAmount: 0, token: 'XLM', gameId: 'lichess-game-abc123', platform: 'lichess' });
    expect(response.status).toBe(400);
  });

  it('returns 400 when gameId is missing', async () => {
    const response = await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ player2: 'GPLAYER2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', stakeAmount: 100, token: 'XLM', platform: 'lichess' });
    expect(response.status).toBe(400);
  });

  it('returns 400 when platform is invalid', async () => {
    const response = await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ player2: 'GPLAYER2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', stakeAmount: 100, token: 'XLM', gameId: 'lichess-game-abc123', platform: 'unknown' });
    expect(response.status).toBe(400);
  });

  it('returns 201 and matches created payload shape', async () => {
    const response = await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ player2: 'GPLAYER2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', stakeAmount: 100, token: 'XLM', gameId: 'lichess-game-abc123', platform: 'lichess' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      matchId: expect.any(Number),
      stakeAmount: 100,
      token: 'XLM',
      gameId: 'lichess-game-abc123',
      platform: 'lichess',
      state: 'Pending',
    });
  });

  it('returns 409 for duplicate gameId', async () => {
    const token = makeToken();
    await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${token}`)
      .send({ player2: 'GPLAYER2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', stakeAmount: 100, token: 'XLM', gameId: 'lichess-game-abc123', platform: 'lichess' });

    const response = await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${token}`)
      .send({ player2: 'GPLAYER3CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', stakeAmount: 100, token: 'XLM', gameId: 'lichess-game-abc123', platform: 'lichess' });

    expect(response.status).toBe(409);
  });
});
