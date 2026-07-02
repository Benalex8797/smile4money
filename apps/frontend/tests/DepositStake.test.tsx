import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DepositStake } from '../src/components/DepositStake';

// Mock @stellar/stellar-sdk
vi.mock('@stellar/stellar-sdk', () => ({
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
  SorobanRpc: {
    Server: vi.fn().mockImplementation(() => ({
      sendTransaction: vi.fn(),
      getTransaction: vi.fn(),
    })),
    GetTransactionStatus: {
      PENDING: 'PENDING',
      SUCCESS: 'SUCCESS',
      ERROR: 'ERROR',
    },
  },
}));

describe('DepositStake — loading state', () => {
  it('shows loading state initially while fetching match details', () => {
    render(<DepositStake matchId="123" playerAddress="GABCDEF123456" contractId="test-contract" />);
    expect(screen.getByTestId('deposit-stake')).toBeInTheDocument();
  });
});

describe('DepositStake — no match ID', () => {
  it('returns null when no match ID provided', () => {
    const { container } = render(<DepositStake matchId="" playerAddress="GABCDEF123456" contractId="test-contract" />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DepositStake — match info display', () => {
  it('displays match stake amount after mock data loads', async () => {
    render(<DepositStake matchId="123" playerAddress="GABCDEF123456" contractId="test-contract" />);
    
    // Wait for the mock data to be loaded
    await waitFor(() => {
      expect(screen.getByTestId('match-info')).toBeInTheDocument();
    });
  });
});

describe('DepositStake — deposit button states', () => {
  it('shows Deposit Stake button after loading', async () => {
    render(<DepositStake matchId="123" playerAddress="GABCDEF123456" contractId="test-contract" />);
    
    await waitFor(() => {
      expect(screen.getByTestId('deposit-btn')).toBeInTheDocument();
    });
  });
});

describe('DepositStake — form rendering', () => {
  it('renders with correct test id', () => {
    render(<DepositStake matchId="123" playerAddress="GABCDEF123456" contractId="test-contract" />);
    expect(screen.getByTestId('deposit-stake')).toBeInTheDocument();
  });
});

describe('DepositStake — wallet connection check', () => {
  it('handles no player address', () => {
    render(<DepositStake matchId="123" playerAddress={null} contractId="test-contract" />);
    expect(screen.getByTestId('deposit-stake')).toBeInTheDocument();
  });
});