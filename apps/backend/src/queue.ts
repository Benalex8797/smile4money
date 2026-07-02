/**
 * Dead-letter queue (DLQ) for failed oracle submissions.
 *
 * Failed submissions are stored in memory (file-based persistence can be added
 * by swapping the store). A retry worker periodically attempts to reprocess
 * each entry and emits `oracle_dlq_depth` for monitoring.
 */

import logger from "./logger";

export interface DlqEntry {
  id: string;
  payload: unknown;
  failureReason: string;
  attempts: number;
  createdAt: number;
  lastAttemptAt: number | null;
}

// In-process store; swap for Redis / file for persistence across restarts.
const dlqStore: Map<string, DlqEntry> = new Map();

/** Write a failed submission to the DLQ. */
export function writeToDlq(payload: unknown, failureReason: string): DlqEntry {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: DlqEntry = {
    id,
    payload,
    failureReason,
    attempts: 0,
    createdAt: Date.now(),
    lastAttemptAt: null,
  };
  dlqStore.set(id, entry);
  logger.warn({ dlqId: id, failureReason }, "oracle_dlq: entry written");
  emitDlqDepth();
  return entry;
}

/** Return all pending DLQ entries (shallow copy). */
export function listDlqEntries(): DlqEntry[] {
  return Array.from(dlqStore.values());
}

/** Remove a successfully processed entry. */
export function removeDlqEntry(id: string): void {
  dlqStore.delete(id);
  emitDlqDepth();
}

/** Emit the oracle_dlq_depth metric. */
function emitDlqDepth(): void {
  const depth = dlqStore.size;
  logger.info({ metric: "oracle_dlq_depth", value: depth }, "oracle_dlq_depth");
}

export type RetryHandler = (entry: DlqEntry) => Promise<void>;

/**
 * Retry worker — call once on startup.
 * Returns a cleanup function that clears the interval.
 */
export function startRetryWorker(
  handler: RetryHandler,
  intervalMs = 60_000
): () => void {
  const timer = setInterval(async () => {
    const entries = listDlqEntries();
    if (entries.length === 0) return;

    logger.info({ count: entries.length }, "oracle_dlq: retry worker running");

    for (const entry of entries) {
      entry.attempts += 1;
      entry.lastAttemptAt = Date.now();
      try {
        await handler(entry);
        removeDlqEntry(entry.id);
        logger.info({ dlqId: entry.id }, "oracle_dlq: entry resolved");
      } catch (err) {
        logger.warn(
          { dlqId: entry.id, attempt: entry.attempts, err },
          "oracle_dlq: retry failed"
        );
      }
    }

    emitDlqDepth();
  }, intervalMs);

  return () => clearInterval(timer);
}
