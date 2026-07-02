import axios from 'axios';
import { RateLimiter } from './rate-limiter.js';

export class GameNotFoundError extends Error {
  constructor(gameId: string) {
    super(`Lichess game not found: ${gameId}`);
    this.name = 'GameNotFoundError';
  }
}

const limiter = new RateLimiter(25, 60_000, 25);

export interface LichessGame {
  id: string;
  winner?: 'white' | 'black';
  status: string;
  opening?: { name?: string };
}

export async function fetchLichessGame(gameId: string): Promise<LichessGame> {
  const token = process.env.LICHESS_API_TOKEN;
  const url = `https://lichess.org/api/game/${encodeURIComponent(gameId)}`;

  return limiter.schedule(async () => {
    const response = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 10000,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 404) {
      throw new GameNotFoundError(gameId);
    }

    if (response.status !== 200) {
      throw new Error(`Lichess API request failed with status ${response.status}`);
    }

    return response.data as LichessGame;
  });
}
