import { matchStore } from '../store/index.js';

export interface MatchDocument {
  matchId: number;
  player1: string;
  player2: string;
  stakeAmount: number;
  token: string;
  gameId: string;
  platform: string;
  state: 'Pending';
}

export class Match {
  static async deleteMany(_filter: Record<string, unknown> = {}): Promise<void> {
    matchStore.clear();
  }

  static async findOne(query: { gameId: string }): Promise<MatchDocument | null> {
    return matchStore.findByGameId(query.gameId);
  }

  static async countDocuments(): Promise<number> {
    return matchStore.count();
  }
}
