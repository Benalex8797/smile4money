import { useEffect, useState } from 'react';

interface TxHashProps {
  hash: string;
}

export function TxHash({ hash }: TxHashProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    if (!hash) return;

    if (!navigator.clipboard?.writeText) {
      setError('Clipboard unavailable');
      return;
    }

    try {
      await navigator.clipboard.writeText(hash);
      setError(null);
      setCopied(true);
    } catch (err) {
      setCopied(false);
      setError(err instanceof Error ? err.message : 'Unable to copy');
    }
  }

  return (
    <span className="tx-hash-block" data-testid="tx-hash-block">
      <span className="tx-hash-value" data-testid="tx-hash-value">
        {hash.slice(0, 8)}…{hash.slice(-8)}
      </span>
      <button
        type="button"
        className="tx-hash-copy-btn"
        onClick={handleCopy}
        data-testid="copy-tx-hash-btn"
        aria-label="Copy transaction hash"
      >
        📋
      </button>
      {copied && (
        <span className="tx-hash-status" role="status" data-testid="tx-hash-copied">
          Copied!
        </span>
      )}
      {error && (
        <span className="tx-hash-error" role="alert" data-testid="tx-hash-error">
          {error}
        </span>
      )}
    </span>
  );
}
