import { useEffect, useState } from 'react';
import type { WalletStatus } from '../types';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';

interface HistoryProps {
  walletState: WalletStatus;
  publicKey?: string | null;
}

interface HorizonTransaction {
  hash: string;
  source_account: string;
  successful: boolean;
  memo: string | null;
  fee_charged: string;
  created_at: string;
  _links: {
    self: { href: string };
  };
}

interface HistoryRow {
  id: string;
  matchId: string;
  opponent: string;
  stake: string;
  result: string;
  payout: string;
  date: string;
}

function parseCursor(href: string) {
  try {
    const url = new URL(href);
    return url.searchParams.get('cursor');
  } catch {
    return null;
  }
}

export function History({ walletState, publicKey }: HistoryProps) {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);

  useEffect(() => {
    if (walletState !== 'connected' || !publicKey) {
      setHistory([]);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const url = new URL(`${HORIZON_URL}/accounts/${publicKey}/transactions`);
    url.searchParams.set('limit', '10');
    url.searchParams.set('order', 'desc');
    if (cursor) url.searchParams.set('cursor', cursor);

    fetch(url.toString())
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load transaction history');
        }
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        const records: HorizonTransaction[] = data._embedded?.records ?? [];
        setHistory(
          records.map((record) => {
            const matchId = record.memo && !Number.isNaN(Number(record.memo)) ? record.memo : '—';
            const opponent = record.source_account === publicKey ? 'Unknown' : record.source_account;
            const stake = record.fee_charged ? `${record.fee_charged} stroops` : '—';
            const result = record.successful ? 'Success' : 'Failed';
            const payout = record.successful ? 'Confirmed' : 'Failed';
            return {
              id: record.hash,
              matchId,
              opponent,
              stake,
              result,
              payout,
              date: new Date(record.created_at).toLocaleString(),
            };
          }),
        );

        setNextCursor(data._links?.next?.href ? parseCursor(data._links.next.href) : null);
        setPrevCursor(data._links?.prev?.href ? parseCursor(data._links.prev.href) : null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load history');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [publicKey, walletState, cursor]);

  if (walletState !== 'connected') {
    return (
      <section className="history-page" data-testid="history-page">
        <h2>Transaction History</h2>
        <p>Please connect your wallet to view match history.</p>
      </section>
    );
  }

  return (
    <section className="history-page" data-testid="history-page">
      <h2>Match History</h2>
      {loading && <p data-testid="history-loading">Loading history…</p>}
      {error && (
        <p className="history-error" role="alert" data-testid="history-error">
          {error}
        </p>
      )}
      {!loading && !error && history.length === 0 && (
        <p data-testid="history-empty">No matches found for this wallet.</p>
      )}
      {!loading && !error && history.length > 0 && (
        <div className="history-table-wrap">
          <table className="history-table" data-testid="history-table">
            <thead>
              <tr>
                <th>Match ID</th>
                <th>Opponent</th>
                <th>Stake</th>
                <th>Result</th>
                <th>Payout</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} data-testid="history-row">
                  <td>{row.matchId}</td>
                  <td>{row.opponent}</td>
                  <td>{row.stake}</td>
                  <td>{row.result}</td>
                  <td>{row.payout}</td>
                  <td>{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="history-pagination">
        <button
          type="button"
          disabled={!prevCursor || loading}
          onClick={() => setCursor(prevCursor)}
          data-testid="history-prev"
        >
          Newer
        </button>
        <button
          type="button"
          disabled={!nextCursor || loading}
          onClick={() => setCursor(nextCursor)}
          data-testid="history-next"
        >
          Older
        </button>
      </div>
    </section>
  );
}
