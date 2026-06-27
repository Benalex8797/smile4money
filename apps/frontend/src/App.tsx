import { ClaimBurn } from './components/claim-burn';
import { NetworkBadge } from './components/NetworkBadge';
import { CreateMatch } from './components/CreateMatch';
import { DepositStake } from './components/DepositStake';
import { MatchStatus } from './components/MatchStatus';
import { useStellarWallet } from './hooks/useStellarWallet';
import { Networks, rpc } from '@stellar/stellar-sdk';
import type { WalletStatus, Network } from './types';

// Extend import.meta env for TypeScript
declare global {
  interface ImportMetaEnv {
    VITE_CONTRACT_ESCROW?: string;
    VITE_STELLAR_RPC_URL?: string;
    VITE_STELLAR_NETWORK?: string;
  }
  interface Window {
    freighterApi?: {
      isConnected: () => Promise<{ isConnected: boolean }>;
      getPublicKey: () => Promise<string>;
      signTransaction: (
        xdr: string,
        opts?: { networkPassphrase?: string },
      ) => Promise<{ signedTxXdr: string }>;
      getNetwork?: () => Promise<{ network: string; networkPassphrase: string }>;
    };
  }
}

const CONTRACT_ESCROW = (import.meta.env as ImportMetaEnv).VITE_CONTRACT_ESCROW || '';
const RPC_URL = (import.meta.env as ImportMetaEnv).VITE_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';

function getNetworkPassphrase(network: Network): string {
  if (network === 'testnet') return Networks.TESTNET;
  if (network === 'mainnet') return Networks.PUBLIC;
  return Networks.TESTNET;
}

async function signAndSubmitTransaction(
  signedTxXdr: string,
  server: rpc.Server,
): Promise<string> {
  // Submit transaction - using type assertion to bypass complex Transaction type
  const result = await (server.sendTransaction as any)(signedTxXdr);

  if (result.status !== 'PENDING') {
    throw new Error(`Transaction submission failed: ${result.status}`);
  }

  // Poll for transaction confirmation
  if (result.hash) {
    await server.pollTransaction(result.hash);
    return result.hash;
  }

  throw new Error('Transaction submitted but no hash returned');
}

export function App() {
  const { status, address, balance, network, connect, disconnect, refreshBalance } = useStellarWallet();

  const walletState = (
    status === 'connected' && network !== 'unknown' && network !== 'testnet'
      ? 'wrongNetwork'
      : status
  ) as WalletStatus;

  const handleClaim = async (amount: string): Promise<string> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    const server = new rpc.Server(RPC_URL);
    const networkPassphrase = getNetworkPassphrase(network as Network);

    // Build and submit claim transaction via Stellar SDK
    // This would:
    // 1. Build a TransactionEnvelope with the contract call
    // 2. Sign with Freighter wallet
    // 3. Submit to Soroban RPC
    // 4. Poll for confirmation
    // For implementation, see the contract call documentation:
    // https://stellar-sdk.js.org/docs/server#sendtransaction
    
    // Sign transaction using Freighter wallet
    if (!window.freighterApi?.signTransaction) {
      throw new Error('Freighter wallet does not support signTransaction');
    }

    // In a real implementation, build transaction XDR here
    // const transactionXdr = buildClaimTransaction(amount, address, networkPassphrase);
    const mockTxXdr = 'AAAA...'; // Placeholder

    const { signedTxXdr } = await window.freighterApi.signTransaction(mockTxXdr, { networkPassphrase });
    return signAndSubmitTransaction(signedTxXdr, server);
  };

  const handleBurn = async (amount: string): Promise<string | void> => {
    console.info('Burn request', amount);
  };

  const handleCreateMatch = async (data: {
    player2: string;
    stakeAmount: string;
    token: 'xlm' | 'usdc';
    gameId: string;
    platform: 'lichess' | 'chesscom';
  }): Promise<string> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    const server = new rpc.Server(RPC_URL);
    const networkPassphrase = getNetworkPassphrase(network as Network);

    // Build and submit create_match transaction via Stellar SDK
    // This would call the contract's create_match function with:
    // - player1 (connected wallet address)
    // - player2 (from form)
    // - stake_amount (from form)
    // - token (from form toggle)
    // - game_id (from form)
    // - platform (from form selector)

    if (!window.freighterApi?.signTransaction) {
      throw new Error('Freighter wallet does not support signTransaction');
    }

    // In a real implementation, build transaction XDR here
    // const transactionXdr = buildCreateMatchTransaction(data, address, networkPassphrase);
    const mockTxXdr = 'AAAA...';

    const { signedTxXdr } = await window.freighterApi.signTransaction(mockTxXdr, { networkPassphrase });
    await signAndSubmitTransaction(signedTxXdr, server);
    return '1'; // Placeholder match ID
  };

  const handleDeposit = async (matchId: string): Promise<void> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    const server = new rpc.Server(RPC_URL);
    const networkPassphrase = getNetworkPassphrase(network as Network);

    // Build and submit deposit transaction via Stellar SDK
    // This would call the contract's deposit function for the given match

    if (!window.freighterApi?.signTransaction) {
      throw new Error('Freighter wallet does not support signTransaction');
    }

    // In a real implementation, build transaction XDR here
    const mockTxXdr = 'AAAA...';

    const { signedTxXdr } = await window.freighterApi.signTransaction(mockTxXdr, { networkPassphrase });
    await signAndSubmitTransaction(signedTxXdr, server);
  };

  return (
    <main className="bg-gray-100" style={{ padding: '2rem', minHeight: '100vh' }}>
      <div className="mb-4">
        <NetworkBadge />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <ClaimBurn
            walletState={walletState}
            onConnect={connect}
            onDisconnect={disconnect}
            onRefreshBalance={refreshBalance}
            onClaim={handleClaim}
            onBurn={handleBurn}
            publicKey={address}
            balance={balance}
            expectedNetwork="testnet"
          />
        </div>
        <div>
          <CreateMatch
            contractId={CONTRACT_ESCROW}
            player1Address={address}
            networkPassphrase={getNetworkPassphrase(network as Network)}
            rpcUrl={RPC_URL}
            onCreateMatch={handleCreateMatch}
          />
        </div>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <DepositStake
            matchId="1"
            playerAddress={address}
            contractId={CONTRACT_ESCROW}
            networkPassphrase={getNetworkPassphrase(network as Network)}
            rpcUrl={RPC_URL}
            onDeposit={handleDeposit}
          />
        </div>
        <div>
          <MatchStatus
            matchId="1"
            contractId={CONTRACT_ESCROW}
            rpcUrl={RPC_URL}
            networkPassphrase={getNetworkPassphrase(network as Network)}
          />
        </div>
      </div>
    </main>
  );
}