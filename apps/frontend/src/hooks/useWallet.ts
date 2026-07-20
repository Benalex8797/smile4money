import { useState, useEffect, useCallback } from 'react';

export type WalletState =
  'checking' | 'notInstalled' | 'disconnected' | 'connecting' | 'connected' | 'wrongNetwork';

declare global {
  interface Window {
    stellar?: {
      isConnected: () => Promise<{ isConnected: boolean }>;
      getPublicKey: () => Promise<string>;
      getNetwork: () => Promise<{ network: string; networkPassphrase: string }>;
      setAllowed: () => Promise<{ error?: { code: number; message: string } }>;
    };
  }
  interface ImportMeta {
    env: {
      VITE_STELLAR_NETWORK?: string;
    };
  }
}

const EXPECTED_NETWORK = (import.meta.env.VITE_STELLAR_NETWORK as string | undefined) || 'testnet';

export function useWallet() {
  const [state, setState] = useState<WalletState>('checking');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expectedNetwork = EXPECTED_NETWORK;

  const checkConnection = useCallback(async () => {
    if (!window.stellar) {
      setState('notInstalled');
      return;
    }

    try {
      const { isConnected } = await window.stellar.isConnected();
      if (!isConnected) {
        setState('disconnected');
        return;
      }

      const pk = await window.stellar.getPublicKey();
      const net = await window.stellar.getNetwork();

      setPublicKey(pk);
      setNetwork(net.network);

      if (net.network !== EXPECTED_NETWORK) {
        setState('wrongNetwork');
      } else {
        setState('connected');
      }
    } catch {
      setState('disconnected');
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const connect = useCallback(async () => {
    if (!window.stellar) {
      setState('notInstalled');
      return;
    }

    setState('connecting');
    setError(null);

    try {
      const { error: accessError } = await window.stellar.setAllowed();
      if (accessError) {
        setState('disconnected');
        setError(accessError.message);
        return;
      }

      const pk = await window.stellar.getPublicKey();
      const net = await window.stellar.getNetwork();

      setPublicKey(pk);
      setNetwork(net.network);

      if (net.network !== EXPECTED_NETWORK) {
        setState('wrongNetwork');
        setError(`Wrong network: expected ${EXPECTED_NETWORK}, got ${net.network}`);
      } else {
        setState('connected');
      }
    } catch (err) {
      setState('disconnected');
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    setError(null);
    const net = await window.stellar?.getNetwork();
    if (net && net.network !== EXPECTED_NETWORK) {
      setState('wrongNetwork');
      setError(`Please switch your Freighter wallet to ${EXPECTED_NETWORK} manually.`);
    } else {
      await checkConnection();
    }
  }, [checkConnection]);

  const disconnect = useCallback(() => {
    setState('disconnected');
    setPublicKey(null);
    setNetwork(null);
    setError(null);
  }, []);

  return { state, publicKey, network, expectedNetwork, connect, switchNetwork, disconnect, error };
}
