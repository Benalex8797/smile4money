import React, { useState, useEffect, useCallback } from 'react';
import { Networks, rpc } from '@stellar/stellar-sdk';

type DepositStatus = 'idle' | 'loading' | 'pending' | 'success' | 'error';

interface MatchDetails {
  stakeAmount: string;
  token: string;
  player1: string;
  player2: string;
  player1Deposited: boolean;
  player2Deposited: boolean;
}

interface DepositStakeProps {
  matchId: string;
  playerAddress: string | null;
  contractId: string;
  networkPassphrase?: string;
  rpcUrl?: string;
  onDeposit?: (matchId: string) => Promise<void>;
}

export function DepositStake({
  matchId,
  playerAddress,
  contractId,
  networkPassphrase = Networks.TESTNET,
  rpcUrl = 'https://soroban-testnet.stellar.org',
  onDeposit,
}: DepositStakeProps) {
  const [matchDetails, setMatchDetails] = useState<MatchDetails | null>(null);
  const [status, setStatus] = useState<DepositStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);

  const hasDeposited = (matchDetails: MatchDetails | null): boolean => {
    if (!matchDetails || !playerAddress) return false;
    return matchDetails.player1Deposited || matchDetails.player2Deposited;
  };

  const fetchMatchDetails = useCallback(async () => {
    if (!matchId || !contractId) return;

    setStatus('loading');
    try {
      // In a real implementation, this would call the contract's get_match function
      // For now, we simulate with mock data
      const mockDetails: MatchDetails = {
        stakeAmount: '100',
        token: 'xlm',
        player1: 'GPLAYER1...',
        player2: 'GPLAYER2...',
        player1Deposited: false,
        player2Deposited: false,
      };
      setMatchDetails(mockDetails);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch match details');
    }
  }, [matchId, contractId]);

  useEffect(() => {
    fetchMatchDetails();
  }, [fetchMatchDetails]);

  const handleDeposit = useCallback(async () => {
    if (!matchId) return;

    setStatus('pending');
    setErrorMsg('');
    setTxHash(null);

    try {
      await onDeposit?.(matchId);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Deposit transaction failed');
    }
  }, [matchId, onDeposit]);

  const isLoading = status === 'loading';
  const isPending = status === 'pending';
  const isDisabled = isLoading || hasDeposited(matchDetails);

  // Loading state
  if (isLoading && !matchDetails) {
    return (
      <div className="deposit-stake" data-testid="deposit-stake">
        <div className="spinner" />
        <p className="loading-message">Loading match details…</p>
      </div>
    );
  }

  // Error loading match
  if (status === 'error' && !matchDetails) {
    return (
      <div className="deposit-stake" data-testid="deposit-stake">
        <p className="feedback error" role="alert" data-testid="deposit-error">
          {errorMsg}
        </p>
        <button
          type="button"
          className="btn btn-retry"
          onClick={fetchMatchDetails}
          data-testid="retry-btn"
        >
          Retry
        </button>
      </div>
    );
  }

  // No match ID provided
  if (!matchId) {
    return null;
  }

  return (
    <div className="deposit-stake" data-testid="deposit-stake">
      <h3 className="deposit-title">Deposit Stake</h3>

      {matchDetails && (
        <div className="match-info" data-testid="match-info">
          <p>
            <span className="match-info-label">Stake Amount:</span>{' '}
            <strong>{matchDetails.stakeAmount}</strong> {matchDetails.token.toUpperCase()}
          </p>
          <p>
            <span className="match-info-label">Player 1:</span>{' '}
            <span className="address">
              {matchDetails.player1.slice(0, 4)}...{matchDetails.player1.slice(-4)}
            </span>
            <span
              className={`status-indicator ${matchDetails.player1Deposited ? 'deposited' : 'pending'}`}
              data-testid="player1-status"
            >
              {matchDetails.player1Deposited ? '✓ Deposited' : 'Pending'}
            </span>
          </p>
          <p>
            <span className="match-info-label">Player 2:</span>{' '}
            <span className="address">
              {matchDetails.player2.slice(0, 4)}...{matchDetails.player2.slice(-4)}
            </span>
            <span
              className={`status-indicator ${matchDetails.player2Deposited ? 'deposited' : 'pending'}`}
              data-testid="player2-status"
            >
              {matchDetails.player2Deposited ? '✓ Deposited' : 'Pending'}
            </span>
          </p>
        </div>
      )}

      <button
        type="button"
        className="btn btn-deposit"
        onClick={handleDeposit}
        disabled={isDisabled}
        data-testid="deposit-btn"
        aria-busy={isPending}
      >
        {isPending
          ? 'Depositing…'
          : hasDeposited(matchDetails)
            ? 'Already Deposited'
            : 'Deposit Stake'}
      </button>

      {/* Success */}
      {status === 'success' && (
        <p className="feedback success" role="status" data-testid="deposit-success">
          Deposit successful!
          {txHash && (
            <span className="tx-hash" data-testid="deposit-tx-hash">
              Tx: {txHash.slice(0, 8)}...{txHash.slice(-8)}
            </span>
          )}
        </p>
      )}

      {/* Error */}
      {status === 'error' && matchDetails && (
        <p className="feedback error" role="alert" data-testid="deposit-error-msg">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

export default DepositStake;
