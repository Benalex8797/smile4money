export interface MatchRecord {
  matchId: number;
  player1: string;
  player2: string;
  stakeAmount: number;
  token: string;
  gameId: string;
  platform: string;
  state: 'Pending';
}

interface CreateMatchPayload {
  player1: string;
  player2: string;
  stakeAmount: number;
  token: string;
  gameId: string;
  platform: string;
}

export class MatchStore {
  private matches = new Map<number, MatchRecord>();
  private gameIds = new Set<string>();
  private nextId = 0;

  async createMatch(payload: CreateMatchPayload): Promise<MatchRecord> {
    if (this.gameIds.has(payload.gameId)) {
      throw new Error('duplicate game_id');
    }

    const record: MatchRecord = {
      matchId: this.nextId,
      player1: payload.player1,
      player2: payload.player2,
      stakeAmount: payload.stakeAmount,
      token: payload.token,
      gameId: payload.gameId,
      platform: payload.platform,
      state: 'Pending',
    };

    this.matches.set(this.nextId, record);
    this.gameIds.add(payload.gameId);
    this.nextId += 1;
    return record;
  }

  async findByGameId(gameId: string): Promise<MatchRecord | null> {
    for (const match of this.matches.values()) {
      if (match.gameId === gameId) {
        return match;
      }
    }
    return null;
  }

  async count(): Promise<number> {
    return this.matches.size;
  }

  clear(): void {
    this.matches.clear();
    this.gameIds.clear();
    this.nextId = 0;
  }
}
