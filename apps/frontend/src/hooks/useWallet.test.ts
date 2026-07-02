import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useWallet } from './useWallet';

describe('useWallet', () => {
  const mockStellar = {
    isConnected: vi.fn(),
    getPublicKey: vi.fn(),
    getNetwork: vi.fn(),
    setAllowed: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'stellar', {
      value: mockStellar,
      configurable: true,
    });
  });

  afterEach(() => {
    delete (window as Window & { stellar?: typeof mockStellar }).stellar;
  });

  it('connects wallet and returns address', async () => {
    mockStellar.isConnected.mockResolvedValue({ isConnected: true });
    mockStellar.getPublicKey.mockResolvedValue('GBTEST123');
    mockStellar.getNetwork.mockResolvedValue({ network: 'testnet', networkPassphrase: 'Test SDF Network ; September 2015' });
    mockStellar.setAllowed.mockResolvedValue({});

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toBe('connected');
    expect(result.current.publicKey).toBe('GBTEST123');
  });

  it('disconnect clears wallet state', () => {
    const { result } = renderHook(() => useWallet());

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.state).toBe('disconnected');
    expect(result.current.publicKey).toBeNull();
    expect(result.current.network).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('wallet not found returns error state', async () => {
    delete (window as Window & { stellar?: typeof mockStellar }).stellar;

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toBe('notInstalled');
  });

  it('permission denied returns error state', async () => {
    mockStellar.isConnected.mockResolvedValue({ isConnected: false });
    mockStellar.setAllowed.mockResolvedValue({ error: { code: 4001, message: 'User rejected request' } });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toBe('disconnected');
    expect(result.current.error).toBe('User rejected request');
  });
});
