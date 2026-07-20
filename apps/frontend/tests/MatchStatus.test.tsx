import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MatchStatus } from '../src/components/MatchStatus';

vi.mock('@stellar/stellar-sdk', () => ({
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
  rpc: {
    Server: vi.fn().mockImplementation(() => ({
      sendTransaction: vi.fn(),
      getTransaction: vi.fn(),
      pollTransaction: vi.fn(),
    })),
    Api: {
      GetTransactionStatus: {
        SUCCESS: 'SUCCESS',
        NOT_FOUND: 'NOT_FOUND',
        FAILED: 'FAILED',
      },
    },
  },
}));

describe('MatchStatus — loading state', () => {
  it('shows loading state while fetching match', () => {
    render(<MatchStatus matchId="123" />);
    expect(screen.getByTestId('match-status')).toBeInTheDocument();
  });
});

describe('MatchStatus — no match ID', () => {
  it('shows message when no match ID provided', () => {
    render(<MatchStatus matchId="" />);
    expect(screen.getByTestId('match-status')).toBeInTheDocument();
    expect(screen.getByText(/Enter a match ID/i)).toBeInTheDocument();
  });
});

describe('MatchStatus — match not found', () => {
  it('shows error when match not found (onFetchMatch returns null)', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue(null);

    render(<MatchStatus matchId="invalid" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('match-not-found')).toBeInTheDocument();
    });
  });
});

describe('MatchStatus — state rendering with match data', () => {
  it('renders pending state when match data is available', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '123',
      state: 'Pending',
      player1: 'GPLAYER1ABC',
      player2: 'GPLAYER2XYZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'game-abc',
    });

    render(<MatchStatus matchId="123" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-pending')).toBeInTheDocument();
    });
  });

  it('renders active state when match data is available', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '123',
      state: 'Active',
      player1: 'GPLAYER1ABC',
      player2: 'GPLAYER2XYZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'game-abc',
    });

    render(<MatchStatus matchId="123" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-active')).toBeInTheDocument();
    });
  });

  it('renders completed state with winner', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '123',
      state: 'Completed',
      player1: 'GPLAYER1ABC',
      player2: 'GPLAYER2XYZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'game-abc',
      winner: 'Player1',
    });

    render(<MatchStatus matchId="123" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-completed')).toBeInTheDocument();
    });
  });

  it('renders cancelled state when match data is available', async () => {
    const onFetchMatch = vi.fn().mockResolvedValue({
      id: '123',
      state: 'Cancelled',
      player1: 'GPLAYER1ABC',
      player2: 'GPLAYER2XYZ',
      stakeAmount: '100',
      token: 'xlm',
      platform: 'lichess',
      gameId: 'game-abc',
    });

    render(<MatchStatus matchId="123" onFetchMatch={onFetchMatch} />);

    await waitFor(() => {
      expect(screen.getByTestId('state-cancelled')).toBeInTheDocument();
    });
  });
});
