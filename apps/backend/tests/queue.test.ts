import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  writeToDlq,
  listDlqEntries,
  removeDlqEntry,
  startRetryWorker,
  type DlqEntry,
} from "../../src/queue";

// Reset the in-memory store between tests by removing all entries
function clearDlq() {
  for (const entry of listDlqEntries()) {
    removeDlqEntry(entry.id);
  }
}

beforeEach(() => {
  clearDlq();
  vi.useFakeTimers();
});

describe("writeToDlq", () => {
  it("adds an entry to the DLQ", () => {
    writeToDlq({ matchId: 1 }, "RPC timeout");
    expect(listDlqEntries()).toHaveLength(1);
  });

  it("stores the payload and failure reason", () => {
    writeToDlq({ matchId: 42 }, "insufficient fees");
    const [entry] = listDlqEntries();
    expect(entry.payload).toEqual({ matchId: 42 });
    expect(entry.failureReason).toBe("insufficient fees");
    expect(entry.attempts).toBe(0);
    expect(entry.lastAttemptAt).toBeNull();
  });

  it("assigns a unique id to each entry", () => {
    writeToDlq({}, "err");
    writeToDlq({}, "err");
    const ids = listDlqEntries().map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("removeDlqEntry", () => {
  it("removes an entry by id", () => {
    const entry = writeToDlq({}, "err");
    removeDlqEntry(entry.id);
    expect(listDlqEntries()).toHaveLength(0);
  });

  it("is a no-op for unknown ids", () => {
    writeToDlq({}, "err");
    expect(() => removeDlqEntry("nonexistent")).not.toThrow();
    expect(listDlqEntries()).toHaveLength(1);
  });
});

describe("startRetryWorker", () => {
  it("calls the handler for each DLQ entry on the interval", async () => {
    writeToDlq({ matchId: 1 }, "network error");
    writeToDlq({ matchId: 2 }, "network error");

    const handler = vi.fn().mockResolvedValue(undefined);
    const stop = startRetryWorker(handler, 1000);

    await vi.runAllTimersAsync();

    expect(handler).toHaveBeenCalledTimes(2);
    stop();
  });

  it("removes entries after a successful retry", async () => {
    writeToDlq({ matchId: 1 }, "err");
    const handler = vi.fn().mockResolvedValue(undefined);
    const stop = startRetryWorker(handler, 1000);

    await vi.runAllTimersAsync();

    expect(listDlqEntries()).toHaveLength(0);
    stop();
  });

  it("keeps entries in DLQ when retry handler throws", async () => {
    writeToDlq({ matchId: 1 }, "err");
    const handler = vi.fn().mockRejectedValue(new Error("still failing"));
    const stop = startRetryWorker(handler, 1000);

    await vi.runAllTimersAsync();

    const entries = listDlqEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].attempts).toBeGreaterThan(0);
    stop();
  });

  it("returns a cleanup function that stops retries", async () => {
    writeToDlq({ matchId: 1 }, "err");
    const handler = vi.fn().mockResolvedValue(undefined);
    const stop = startRetryWorker(handler, 1000);
    stop();

    await vi.runAllTimersAsync();

    expect(handler).not.toHaveBeenCalled();
  });
});
