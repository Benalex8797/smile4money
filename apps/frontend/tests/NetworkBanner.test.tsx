import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkBanner } from '../src/components/NetworkBanner';

// Mock VITE_STELLAR_NETWORK env variable
beforeEach(() => {
  vi.stubEnv('VITE_STELLAR_NETWORK', 'testnet');
});

describe('NetworkBanner', () => {
  it('renders banner when wallet is on wrong network', () => {
    render(<NetworkBanner walletNetwork="mainnet" />);
    const banner = screen.getByTestId('network-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('mainnet');
    expect(banner).toHaveTextContent('testnet');
  });

  it('does not render banner when network matches', () => {
    render(<NetworkBanner walletNetwork="testnet" />);
    expect(screen.queryByTestId('network-banner')).not.toBeInTheDocument();
  });

  it('does not render banner when walletNetwork is null', () => {
    render(<NetworkBanner walletNetwork={null} />);
    expect(screen.queryByTestId('network-banner')).not.toBeInTheDocument();
  });

  it('banner has alert role for accessibility', () => {
    render(<NetworkBanner walletNetwork="mainnet" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('includes a link to switch networks', () => {
    render(<NetworkBanner walletNetwork="futurenet" />);
    const link = screen.getByRole('link', { name: /switch network/i });
    expect(link).toBeInTheDocument();
  });
});
