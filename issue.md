# smile4money — Issue Tracker

125 tracked issues across smart contracts, oracle, backend, frontend, infrastructure, testing, and documentation.

---

## Smart Contract — Escrow

### Issue #1 — `initialize` panics instead of returning a typed error on re-initialization

**Area:** `contracts/escrow/src/lib.rs`
**Priority:** High
**Type:** Bug / API Consistency

**Description:**
`initialize` calls `panic!("Contract already initialized")` when called a second time. Every other guard in the contract returns `Err(Error::AlreadyInitialized)` or a typed variant. A panic produces an opaque host error on-chain and cannot be distinguished from other panics by client code. The oracle contract correctly returns `Err(Error::AlreadyInitialized)` for the same guard.

**Expected behaviour:** Return `Err(Error::AlreadyInitialized)` so callers can pattern-match the error code.

**Steps to reproduce:** Call `initialize` twice on a freshly deployed escrow contract; observe `WasmVm` host error instead of `Error(Contract, #7)`.

---

### Issue #2 — `override_result` error name is semantically inverted

**Area:** `contracts/escrow/src/lib.rs` — `override_result`
**Priority:** Medium
**Type:** Bug / Logic Error

**Description:**
When the dispute window has expired, `override_result` returns `Err(Error::DisputeWindowActive)`. The error name reads "the window is still active," but the code path is reached when the window has already *expired*. This makes client-side error handling confusing — a caller that catches `DisputeWindowActive` would interpret it as "try again later," when the correct interpretation is "too late, use `finalize_result`."

**Expected behaviour:** Introduce `Error::DisputeWindowExpired` (or reuse `Error::InvalidState`) and return it when `current > pending_result_ledger + DISPUTE_WINDOW_LEDGERS` inside `override_result`.

---

### Issue #3 — `finalize_result` is callable by anyone, including adversaries who can time it to cause MEV

**Area:** `contracts/escrow/src/lib.rs` — `finalize_result`
**Priority:** Medium
**Type:** Security / Design

**Description:**
`finalize_result` requires no authorization and can be called by any account the instant the dispute window expires. While payout correctness is unaffected, it means a third party can trigger the payout transaction and collect any XDR fee rebate or simply grief a player who intended to call it themselves. In a MEV-sensitive context this is worth restricting or at least documenting explicitly.

**Expected behaviour:** Either restrict `finalize_result` to the matched players / oracle / admin, or add a clear doc comment stating it is intentionally permissionless and why.

---

### Issue #4 — `claim_timeout` reuses `Error::MatchTimedOut` to mean "too early"

**Area:** `contracts/escrow/src/lib.rs` — `claim_timeout`
**Priority:** Medium
**Type:** API Clarity / Bug

**Description:**
When the timeout period has not yet elapsed, `claim_timeout` returns `Err(Error::MatchTimedOut)` with the comment "callers should interpret it as 'timeout not yet reached'." The error name `MatchTimedOut` strongly implies the match *has* timed out, not that it has not timed out yet. This is semantically backwards and will cause bugs in any client that reads the error name.

**Expected behaviour:** Introduce `Error::TimeoutNotReached` (or `Error::TooEarly`) for the "not yet elapsed" case and reserve `MatchTimedOut` for when a match actually needs claiming.

---

### Issue #5 — `cancel_match` cannot cancel an `Active` match even by mutual consent

**Area:** `contracts/escrow/src/lib.rs` — `cancel_match`
**Priority:** Medium
**Type:** Feature Gap

**Description:**
`cancel_match` is restricted to `Pending` matches only. Once both players have deposited and the match becomes `Active`, there is no on-chain mechanism for them to mutually agree to cancel before the oracle submits a result — even if the game was never played. The only escape hatch then becomes `claim_timeout`, which requires waiting 7 days (~120 960 ledgers).

**Expected behaviour:** Allow `cancel_match` in the `Active` state when both `player1` and `player2` authorize the call, refunding both stakes immediately.

---

### Issue #6 — `is_paused` clones `Env` unnecessarily on every call site

**Area:** `contracts/escrow/src/lib.rs`
**Priority:** Low
**Type:** Performance / Code Quality

**Description:**
Every call to `Self::is_paused(env.clone())` clones the environment. `is_paused` only performs a read and does not need ownership. The signature should accept `&Env` to avoid the clone cost (and the associated budget usage on-chain).

**Expected behaviour:** Change `pub fn is_paused(env: Env)` to `pub fn is_paused(env: &Env)` and update all call sites to pass `&env`.

---

### Issue #7 — `deposit` reads `is_paused` via a full `env.clone()` before loading the match

**Area:** `contracts/escrow/src/lib.rs` — `deposit`
**Priority:** Low
**Type:** Performance

**Description:**
`deposit` calls `Self::is_paused(env.clone())` which clones the environment before any other work. If the contract is not paused (the common case), the clone is wasted. The pause check should use a borrow once `is_paused` accepts `&Env` (see Issue #6), and should be moved after the cheap `validate_match_id` check that can fail early with no clone cost.

---

### Issue #8 — `create_match` event publishes stale `m.player1` / `m.player2` after move

**Area:** `contracts/escrow/src/lib.rs` — `create_match`
**Priority:** Medium
**Type:** Bug

**Description:**
After `let m = Match { player1, player2, ... }`, the code calls `env.events().publish(... (id, m.player1, m.player2, ...))`. Because `player1` and `player2` were moved into `m`, this compiles only because `Address` is `Clone`. However if the struct field ordering or a refactor causes partial moves, the event could silently publish default/zero values. The event should capture the original `player1` / `player2` locals before they are moved into the struct, or clone explicitly.

---

### Issue #9 — No `get_match_count` public view function

**Area:** `contracts/escrow/src/lib.rs`
**Priority:** Low
**Type:** Feature Gap

**Description:**
`get_match_count` is a private helper. Frontend and off-chain tooling have no way to query the total number of matches without enumerating via `list_matches`. Exposing it as a public read-only function would enable efficient pagination and progress displays.

**Expected behaviour:** Add `pub fn match_count(env: Env) -> u64` that returns `Self::get_match_count(&env)`.

---

### Issue #10 — `list_matches` silently caps at 100 without signalling the cap to callers

**Area:** `contracts/escrow/src/lib.rs` — `list_matches`
**Priority:** Low
**Type:** API Usability

**Description:**
When a caller requests `limit > 100`, the cap is applied silently. Callers have no way to detect whether they received fewer results because the count was exhausted or because the limit was silently reduced. The function should either document this clearly or return a tuple `(Vec<u64>, bool)` where the bool indicates whether more results exist.

---

### Issue #11 — `emergency_drain` emits event with `balance` before the transfer succeeds

**Area:** `contracts/escrow/src/lib.rs` — `emergency_drain`
**Priority:** Medium
**Type:** Bug

**Description:**
The event `(balance, to, admin)` is published after `client.transfer(...)` is called, but the emitted `balance` value was captured before the transfer. If `client.transfer` panics (e.g. due to insufficient contract balance from a race condition), the event is never emitted. However the event is emitted with `balance` even when `balance == 0` and the transfer is skipped, producing a misleading `drain` event with amount 0.

**Expected behaviour:** Skip the event entirely when `balance == 0`. Emit the event only on a successful non-zero drain.

---

### Issue #12 — `transfer_admin` on escrow does not validate new admin is not the zero address

**Area:** `contracts/escrow/src/lib.rs` — `transfer_admin`
**Priority:** High
**Type:** Security

**Description:**
`transfer_admin` only checks against the specific zero-address constant `GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF` and checks `new_admin == current_admin`. It does not guard against other obviously invalid addresses. Additionally, the zero-address check uses a string comparison via `new_admin.to_string()` which is expensive on-chain and fragile if the string representation ever changes.

**Expected behaviour:** Compare `Address` values directly (not via string) and add a dedicated helper `fn is_zero_address(addr: &Address) -> bool` so the check is readable and maintainable.

---

### Issue #13 — `update_oracle` does not validate that `new_oracle` is different from the current oracle

**Area:** `contracts/escrow/src/lib.rs` — `update_oracle`
**Priority:** Low
**Type:** Defensive Programming

**Description:**
`update_oracle` allows the admin to set the oracle to the same address it already holds. This is a no-op on state but emits an `oracle_updated` event with `old_oracle == new_oracle`, which would confuse off-chain listeners parsing event logs.

**Expected behaviour:** Return `Err(Error::InvalidAdmin)` (or a new `Error::NoChange`) when `new_oracle == old_oracle`.

---

### Issue #14 — `submit_result` on oracle has a redundant duplicate `game_id` length check

**Area:** `contracts/oracle/src/lib.rs` — `submit_result`
**Priority:** Low
**Type:** Code Quality

**Description:**
`submit_result` checks `game_id_len == 0 || game_id_len > MAX_GAME_ID_LEN` and returns early, then later checks `if game_id.len() > 64` again. The second check is always unreachable because the function already returned if `game_id_len > 64`. This dead code can mislead readers into thinking the first check only catches the empty-string case.

**Expected behaviour:** Remove the second redundant check at `if game_id.len() > 64`.

---

### Issue #15 — Oracle `withdraw` does not validate `amount > 0`

**Area:** `contracts/oracle/src/lib.rs` — `withdraw`
**Priority:** Medium
**Type:** Defensive Programming

**Description:**
`withdraw` allows `amount = 0` to be passed. The SEP-41 token standard may or may not reject zero-amount transfers depending on the token implementation. A zero-amount withdraw emits no event and silently succeeds, wasting compute budget. An explicit guard prevents confusion.

**Expected behaviour:** Return `Err(Error::InvalidAmount)` (add this variant to oracle errors) when `amount <= 0`.

---

### Issue #16 — `cancel_match` does not set `cancelled_ledger` on timeout path

**Area:** `contracts/escrow/src/lib.rs` — `claim_timeout`
**Priority:** Medium
**Type:** Bug / Data Integrity

**Description:**
When `claim_timeout` transitions the match to `Cancelled`, it does not set `m.cancelled_ledger = Some(env.ledger().sequence())`. The `cancelled_ledger` field is set only in `cancel_match`, leaving it as `None` for timeout-cancelled matches. Off-chain indexers that use `cancelled_ledger` to determine when a match ended will incorrectly report `None` for timed-out matches.

**Expected behaviour:** Add `m.cancelled_ledger = Some(env.ledger().sequence());` in `claim_timeout` before writing back to storage.

---

### Issue #17 — `get_escrow_balance` returns `0` for `PendingResult` state even though funds are still locked

**Area:** `contracts/escrow/src/lib.rs` — `get_escrow_balance`
**Priority:** Medium
**Type:** Bug

**Description:**
`get_escrow_balance` only returns `0` for `Completed` and `Cancelled` states. In `PendingResult` state the funds are still locked in escrow, so returning the balance would be correct. But the logic is also correct currently — `PendingResult` falls through to the deposit-flag calculation. However, the function does *not* handle the `Active` state where only one player may have deposited — actually both must have for Active, so that case is fine. The real issue is there is no test covering `PendingResult` balance reporting.

**Expected behaviour:** Add a test verifying `get_escrow_balance` returns `stake_amount * 2` for a match in `PendingResult` state.

---

### Issue #18 — Contract-level TTL is not extended on `deposit` when only one player has deposited

**Area:** `contracts/escrow/src/lib.rs` — `deposit`
**Priority:** Medium
**Type:** Storage / Correctness

**Description:**
`deposit` extends the persistent TTL of the `Match` record on every call. However, it does not extend the `instance` storage TTL (which holds `Oracle`, `Admin`, `Token`, `MatchCount`, `Paused`). If many deposits happen near the end of the instance TTL, the instance storage could expire before matches complete, making `submit_result` fail because it cannot read `DataKey::Oracle`.

**Expected behaviour:** Call `env.storage().instance().extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT)` in `deposit` (and other mutating functions that don't already do this).

---

### Issue #19 — No `get_oracle` or `get_admin` public view functions on escrow contract

**Area:** `contracts/escrow/src/lib.rs`
**Priority:** Low
**Type:** Feature Gap

**Description:**
There are no public read functions to query the current oracle or admin address from the escrow contract. Off-chain tooling and frontends need to verify these addresses for trust validation and display. Without them, clients must parse raw storage slots.

**Expected behaviour:** Add `pub fn get_oracle(env: Env) -> Result<Address, Error>` and `pub fn get_admin(env: Env) -> Result<Address, Error>`.

---

### Issue #20 — `finalize_result` double-matches `winner` with unnecessary clone

**Area:** `contracts/escrow/src/lib.rs` — `finalize_result`
**Priority:** Low
**Type:** Code Quality

**Description:**
`finalize_result` first matches `winner` to compute `payout_amount` (consuming or cloning it), then calls `winner.clone()` again to match inside the transfer block. The pattern can be simplified by merging both matches into one, reducing the clone cost and making the code easier to read.

---

### Issue #21 — `MAX_STAKE` constant has no corresponding test for the exact boundary value

**Area:** `contracts/escrow/src/lib.rs`, `contracts/escrow/src/tests.rs`
**Priority:** Low
**Type:** Testing Gap

**Description:**
There is a test for `stake_amount = MAX_STAKE + 1` returning `StakeTooHigh`, but no test confirming that `stake_amount = MAX_STAKE` exactly is accepted. Off-by-one errors at the boundary are common and should be explicitly covered.

**Expected behaviour:** Add a test: `create_match` with `stake_amount = MAX_STAKE` should succeed.

---

### Issue #22 — No test for `finalize_result` called exactly at the dispute window boundary ledger

**Area:** `contracts/escrow/src/tests.rs`
**Priority:** Low
**Type:** Testing Gap

**Description:**
Tests cover `finalize_result` being called well after the window and being rejected before. There is no test for calling it at exactly `pending_result_ledger + DISPUTE_WINDOW_LEDGERS` (the boundary, which should still be rejected since the guard is `current <= ...`). Boundary tests are critical for time-locked functions.

---

### Issue #23 — `override_result` does not emit an event when the `pending_winner` is changed to the same value

**Area:** `contracts/escrow/src/lib.rs` — `override_result`
**Priority:** Low
**Type:** Code Quality

**Description:**
`override_result` always emits `(match_id, old_winner, new_winner)` even when `old_winner == new_winner`. This produces misleading events on-chain suggesting a change occurred when none did.

**Expected behaviour:** Check `if old_winner != new_winner` before emitting the override event, or add the check as a guard that returns `Err(Error::NoChange)`.

---

### Issue #24 — `pause` and `unpause` do not check current state before toggling

**Area:** `contracts/escrow/src/lib.rs` — `pause`, `unpause`
**Priority:** Low
**Type:** Defensive Programming

**Description:**
Calling `pause` on an already-paused contract succeeds silently and emits a `paused` event. Similarly, `unpause` on an already-unpaused contract emits an `unpaused` event. These duplicate events pollute the event log and can confuse off-chain listeners expecting state transitions.

**Expected behaviour:** Return an error (e.g. `Error::AlreadyPaused` / `Error::NotPaused`) or simply skip the write and event when the state is already as requested.

---

### Issue #25 — `create_match` does not enforce that `game_id` contains only printable ASCII

**Area:** `contracts/escrow/src/lib.rs` — `create_match`
**Priority:** Medium
**Type:** Input Validation

**Description:**
The only `game_id` validation is length (1–64 bytes). A caller could submit a `game_id` containing null bytes, control characters, or non-UTF-8 sequences. The oracle backend matches game IDs against Lichess/Chess.com API identifiers which are always alphanumeric. Allowing arbitrary bytes could cause silent mismatches between the stored ID and the oracle's lookup key.

**Expected behaviour:** Add a `game_id` character-set validation (alphanumeric + hyphen/underscore only) or at minimum document the accepted character set and add a test for a null-byte game_id being rejected.

---

### Issue #26 — Oracle `list_results` scans by sequential match IDs even for sparse data

**Area:** `contracts/oracle/src/lib.rs` — `list_results`
**Priority:** Medium
**Type:** Performance

**Description:**
`list_results` iterates `start..start+cap` and calls `env.storage().persistent().get(...)` for every ID in that range, even if most have no stored result. In a production deployment with thousands of matches, requesting a wide range will burn significant compute budget on storage misses. 

**Expected behaviour:** Consider a linked-list approach or maintain an explicit result count in instance storage that clients can use to construct efficient page requests.

---

### Issue #27 — No `get_token` view function on the escrow contract

**Area:** `contracts/escrow/src/lib.rs`
**Priority:** Low
**Type:** Feature Gap

**Description:**
The token address is stored in instance storage but there is no public accessor. Frontends and integrators cannot verify which token a deployed contract accepts without parsing raw WASM storage or deploying their own read call.

**Expected behaviour:** Add `pub fn get_token(env: Env) -> Result<Address, Error>`.

---

### Issue #28 — `Match.activated_ledger` is `u32` but is initialized to `0`, which is a valid ledger number

**Area:** `contracts/escrow/src/types.rs`
**Priority:** Medium
**Type:** Data Integrity / Design

**Description:**
`activated_ledger: 0` is used as a sentinel meaning "not yet activated." However, ledger 0 is technically a valid ledger sequence number (the genesis ledger). If a match were somehow created at ledger 0, the timeout logic `current <= 0 + TIMEOUT_LEDGERS` would still work, but the field's meaning is ambiguous. Using `Option<u32>` would make the "not activated" state explicit and type-safe.

**Expected behaviour:** Change `activated_ledger: u32` to `activated_ledger: Option<u32>` and update `claim_timeout` to handle `None` as `InvalidState`.

---

### Issue #29 — `Match.pending_result_ledger` has the same sentinel-zero ambiguity as `activated_ledger`

**Area:** `contracts/escrow/src/types.rs`
**Priority:** Medium
**Type:** Data Integrity / Design

**Description:**
Same issue as #28. `pending_result_ledger: 0` is used as "no result submitted yet" but `0` is a valid ledger. `finalize_result` would incorrectly allow finalization at `current > 0 + DISPUTE_WINDOW_LEDGERS` if the contract is ever deployed at genesis ledgers.

**Expected behaviour:** Change to `pending_result_ledger: Option<u32>` and handle `None` as `InvalidState` in `finalize_result` and `override_result`.

---

### Issue #30 — No on-chain event emitted when `emergency_drain` is called with zero balance

**Area:** `contracts/escrow/src/lib.rs` — `emergency_drain`
**Priority:** Low
**Type:** Observability

**Description:**
When `balance == 0`, the transfer is skipped but the function still returns `Ok(())`. No event is emitted. An admin calling `emergency_drain` with zero balance gets silent success with no audit trail entry, which complicates incident post-mortems.

**Expected behaviour:** Either return an error when `balance == 0` or emit a `drain_noop` event to preserve the audit trail.

---

### Issue #31 — `transfer_admin` on escrow emits event before confirming `new_admin` is stored

**Area:** `contracts/escrow/src/lib.rs` — `transfer_admin`
**Priority:** Low
**Type:** Code Quality

**Description:**
`env.storage().instance().set(&DataKey::Admin, &new_admin)` is called before the event is emitted. This is the correct order — the event should be the last operation. But there is also no `extend_ttl` call after the admin transfer, meaning if the instance TTL is near expiry, the new admin's first read could fail.

**Expected behaviour:** Add `env.storage().instance().extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT)` at the end of `transfer_admin`.

---

### Issue #32 — No test for `claim_timeout` when called by a third party (non-player)

**Area:** `contracts/escrow/src/tests.rs`
**Priority:** Low
**Type:** Testing Gap

**Description:**
Tests confirm that a player can call `claim_timeout` after the timeout period. There is no test verifying that a third party (an address that is neither `player1` nor `player2`) is rejected with `Error::Unauthorized`.

---

### Issue #33 — No test for `emergency_drain` when contract has zero balance

**Area:** `contracts/escrow/src/tests.rs`
**Priority:** Low
**Type:** Testing Gap

**Description:**
`emergency_drain` silently succeeds when balance is zero. There is no test exercising this path. A test should confirm the function returns `Ok(())` and emits no transfer event.

---

### Issue #34 — `submit_result` on the escrow contract does not check `NotFunded` before `InvalidState`

**Area:** `contracts/escrow/src/lib.rs` — `submit_result`
**Priority:** Low
**Type:** Code Quality / API Clarity

**Description:**
`submit_result` checks `m.state != MatchState::Active` returning `InvalidState`, then checks `!m.player1_deposited || !m.player2_deposited` returning `NotFunded`. But by design, a match can only reach `Active` state if both players have deposited. So the `NotFunded` check is dead code — it can never be reached after `state == Active` passes. The check should either be removed (with a comment explaining why it's invariant) or moved to a test assertion.

---

### Issue #35 — Contract registry has no maximum entries guard against unbounded growth

**Area:** `contracts/contract-registry/src/lib.rs`
**Priority:** Medium
**Type:** Security / Resource Exhaustion

**Description:**
The contract registry allows an unbounded number of entries to be registered. On Stellar, each persistent storage entry costs ledger rent. An admin with malicious intent or a misconfigured script could register thousands of entries, inflating storage costs and eventually making the registry unusable due to budget exhaustion during reads.

**Expected behaviour:** Add a `MAX_ENTRIES` constant (e.g. 256) and return `Error::MaxEntriesReached` when the limit is hit, or implement entry expiry.

---

### Issue #36 — No `get_platform` view function — platform is stored in `Match` but not queryable alone

**Area:** `contracts/escrow/src/lib.rs`
**Priority:** Low
**Type:** API Usability

**Description:**
The `platform` field (Lichess vs ChessDotCom) is embedded in the `Match` struct returned by `get_match`. There is no dedicated view that returns only the platform for a given match ID. While callers can call `get_match`, a lightweight oracle service might want just the platform without deserializing the full struct.

---

### Issue #37 — `create_match` does not validate that `player2` is not the zero address

**Area:** `contracts/escrow/src/lib.rs` — `create_match`
**Priority:** Medium
**Type:** Input Validation

**Description:**
`create_match` checks `player1 == player2` but does not check whether either address is the zero/burn address `GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`. A match created with player2 as the zero address would result in stakes being sent to an uncontrolled address on payout.

**Expected behaviour:** Validate both `player1` and `player2` are not the zero address before creating the match.

---

### Issue #38 — `list_matches` and `list_results` have no cursor/offset-based pagination support

**Area:** `contracts/escrow/src/lib.rs`, `contracts/oracle/src/lib.rs`
**Priority:** Medium
**Type:** Feature Gap

**Description:**
Both listing functions use `start` + `limit` pagination. If matches are deleted or sparse, callers cannot distinguish "end of data" from "gap in IDs." A standard cursor-based approach using the last seen match ID would be more robust for production indexing.

---

### Issue #39 — No on-chain event when `deposit` transitions match from `Pending` to `Active` with only one deposit

**Area:** `contracts/escrow/src/lib.rs` — `deposit`
**Priority:** Low
**Type:** Observability

**Description:**
When the first player deposits, only a `deposit` event is emitted. When the second player deposits, both a `deposit` event and an `activated` event are emitted. Off-chain listeners cannot tell from events alone which player deposited first or track the half-funded state. Adding a `half_funded` or `first_deposit` event when only one player has deposited would improve observability.

---

### Issue #40 — `DISPUTE_WINDOW_LEDGERS` and `TIMEOUT_LEDGERS` are not configurable at initialization time

**Area:** `contracts/escrow/src/lib.rs`
**Priority:** Medium
**Type:** Design / Flexibility

**Description:**
`DISPUTE_WINDOW_LEDGERS` (24h) and `TIMEOUT_LEDGERS` (7 days) are hardcoded constants. Different deployments (testnet vs mainnet, casual vs high-stakes) may need different windows. Making them configurable parameters in `initialize` would avoid redeployment for timing adjustments.

**Expected behaviour:** Accept optional `dispute_window` and `timeout_ledgers` parameters in `initialize`, defaulting to the current constants when not provided.

---

### Issue #41 — No test verifying that a paused contract still allows `cancel_match`

**Area:** `contracts/escrow/src/tests.rs`
**Priority:** Medium
**Type:** Testing Gap

**Description:**
The code comment says "Cancellation is allowed while the contract is paused so players can recover funds." There is no test confirming this. If `cancel_match` accidentally gains a pause check in a future refactor, the regression would go undetected.

**Expected behaviour:** Add a test: pause the contract, then call `cancel_match` on a pending match and verify it succeeds.

---

### Issue #42 — Oracle contract has no TTL extension on `initialize`

**Area:** `contracts/oracle/src/lib.rs` — `initialize`
**Priority:** Medium
**Type:** Storage / Correctness

**Description:**
The oracle `initialize` function stores `DataKey::Admin` in instance storage but never calls `extend_ttl`. On Stellar, new instance entries start with a default TTL. If no subsequent state-changing call is made before the TTL expires, the oracle becomes unresponsive. The escrow contract calls `extend_ttl` in its `initialize`; the oracle should too.

**Expected behaviour:** Add `env.storage().instance().extend_ttl(MATCH_TTL_LEDGERS, MATCH_TTL_LEDGERS)` at the end of oracle `initialize`.


---

## Backend (Oracle Service)

### Issue #43 — Oracle backend has no retry logic for failed on-chain `submit_result` transactions

**Area:** `apps/backend/src/`
**Priority:** High
**Type:** Reliability

**Description:**
The backend oracle service fetches a game result from Lichess/Chess.com and calls `submit_result` on the on-chain escrow contract. If the Stellar transaction fails due to transient network issues (fee bump needed, sequence number stale, RPC timeout), the result is never submitted and the match stays `Active` until it times out 7 days later. There is no retry queue or dead-letter store.

**Expected behaviour:** Implement exponential-backoff retry with a configurable max-attempts limit. Failed submissions after all retries should be written to a dead-letter queue and trigger an alert.

---

### Issue #44 — No idempotency guard in the oracle backend — duplicate submissions are possible

**Area:** `apps/backend/src/`
**Priority:** High
**Type:** Reliability / Correctness

**Description:**
If the oracle service crashes and restarts mid-submission, it may attempt to call `submit_result` again for the same `match_id`. The on-chain contract rejects the second call with `Error::AlreadySubmitted`, but the backend currently treats this as an unexpected error rather than an idempotent success.

**Expected behaviour:** Before submitting, check `oracle.has_result(match_id)` and treat `true` as "already done — skip." Log as informational, not error.

---

### Issue #45 — No authentication on the backend REST API endpoints

**Area:** `apps/backend/src/routes/`
**Priority:** High
**Type:** Security

**Description:**
The backend exposes REST endpoints for creating matches and querying status. None of the routes require API key authentication or JWT validation. Any actor who discovers the backend URL can submit match creation requests or query sensitive match data.

**Expected behaviour:** Implement JWT-based authentication middleware on all mutating endpoints. Read-only status endpoints may be public but should still be rate-limited.

---

### Issue #46 — Backend does not validate that the game result belongs to the expected players

**Area:** `apps/backend/src/fetchers/`
**Priority:** High
**Type:** Security

**Description:**
When the oracle fetches a game result, it trusts the game ID without verifying that the players in the API response match the on-chain match record. A malicious actor who knows the `match_id` could register a different game's result if the oracle does not cross-check player identities.

**Expected behaviour:** After fetching the result, verify that the platform's reported player usernames correspond to the Stellar addresses registered in the on-chain match.

---

### Issue #47 — Backend job queue is in-memory only — all pending jobs lost on restart

**Area:** `apps/backend/src/queue.ts`
**Priority:** High
**Type:** Reliability

**Description:**
The oracle job queue is held in memory. If the backend process crashes or is restarted during a deployment, all pending jobs are lost. Matches queued for result submission will never be processed unless re-queued manually.

**Expected behaviour:** Persist the job queue to a durable store (Redis, PostgreSQL, or SQLite) so jobs survive restarts.

---

### Issue #48 — No rate limiting on Lichess/Chess.com API calls in the backend fetchers

**Area:** `apps/backend/src/fetchers/`
**Priority:** Medium
**Type:** Reliability

**Description:**
The `bottleneck` package is listed as a dependency but its limiters are not verifiably configured with Lichess/Chess.com limits. Exceeding 60 req/min on Lichess results in 429 errors and temporary bans, blocking result delivery for all active matches.

**Expected behaviour:** Configure `Bottleneck` limiters at 30 req/min for Lichess and 20 req/min for Chess.com, exposed as environment variables.

---

### Issue #49 — Backend health check endpoint does not verify RPC or DB connectivity

**Area:** `apps/backend/src/routes/`
**Priority:** Medium
**Type:** Observability / Operations

**Description:**
`/health` returns HTTP 200 unconditionally. It does not verify Stellar RPC connectivity or that the oracle keypair is loaded. Kubernetes/ECS readiness probes will consider the pod ready even when it cannot process jobs.

**Expected behaviour:** Run dependency connectivity checks and return HTTP 503 with a diagnostic JSON body if any dependency is unhealthy.

---

### Issue #50 — Oracle private key is not validated at startup against the on-chain registered oracle address

**Area:** `apps/backend/src/`
**Priority:** High
**Type:** Security / Operational Safety

**Description:**
The oracle signing key is read from an environment variable with no validation that it matches the on-chain registered oracle address. A misconfigured key causes all submissions to fail at runtime rather than failing fast at startup.

**Expected behaviour:** At startup, derive the public key, call `get_oracle()` on the escrow contract, assert they match, and refuse to start if they do not.

---

### Issue #51 — Backend `matches.test.ts` missing test for querying a non-existent match ID

**Area:** `apps/backend/tests/matches.test.ts`
**Priority:** Low
**Type:** Testing Gap

**Description:**
`matches.test.ts` covers happy-path match creation and retrieval but has no test for querying a match ID that does not exist on-chain, verifying the API returns HTTP 404 with a structured error body.

---

### Issue #52 — No circuit breaker for the Stellar RPC endpoint

**Area:** `apps/backend/src/`
**Priority:** Medium
**Type:** Reliability

**Description:**
If the Stellar RPC endpoint is degraded, the backend will keep retrying all pending jobs indefinitely, flooding the endpoint with failing requests. There is no circuit-breaker pattern.

**Expected behaviour:** After N consecutive RPC failures, pause all job processing for a configurable cool-down period before retrying.

---

### Issue #53 — Stellar transaction hash not logged after successful `submit_result`

**Area:** `apps/backend/src/`
**Priority:** Medium
**Type:** Observability

**Description:**
When the oracle successfully submits a result on-chain, the Stellar transaction hash is not logged. This hash is the primary audit trail linking off-chain oracle decisions to on-chain events, and is essential for post-incident investigation.

**Expected behaviour:** Log the transaction hash at `INFO` level after every successful submission, including `match_id`, `game_id`, `result`, and `tx_hash`.

---

### Issue #54 — `queue.test.ts` does not test job deduplication for the same `match_id`

**Area:** `apps/backend/tests/queue.test.ts`
**Priority:** Low
**Type:** Testing Gap

**Description:**
The queue tests verify enqueue and process but not what happens when the same `match_id` is enqueued twice. Without deduplication, a match could have its result submitted twice, triggering `AlreadySubmitted` errors.

---

### Issue #55 — Backend uses `console.log` throughout instead of structured logging

**Area:** `apps/backend/src/`
**Priority:** Low
**Type:** Observability

**Description:**
The backend uses `console.log` throughout rather than a structured JSON logger. In production, log aggregation tools (Datadog, CloudWatch, Loki) require structured JSON with standard fields to enable searching and alerting.

**Expected behaviour:** Replace all `console.log/error/warn` with a structured logger (e.g. `pino`) emitting JSON with `level`, `timestamp`, `service`, `match_id`, and `message` fields.

---

### Issue #56 — Backend does not handle in-progress game status from platform APIs

**Area:** `apps/backend/src/fetchers/`
**Priority:** Medium
**Type:** Logic Error

**Description:**
If the oracle polls a platform API for a game that is still in progress, the response includes a status like `"started"`. It is unclear whether the backend handles this explicitly as a "retry later" signal or treats it as an error, potentially leaving jobs in an unknown state.

**Expected behaviour:** Explicitly detect in-progress game status and re-enqueue the job with a configurable polling interval (e.g. 30 seconds).

---

### Issue #57 — Backend server has no graceful shutdown handler for `SIGTERM`

**Area:** `apps/backend/src/server.ts`
**Priority:** Medium
**Type:** Reliability / Operations

**Description:**
The server does not handle `SIGTERM` or `SIGINT`. On a container restart, in-flight requests are abruptly terminated and any in-progress oracle submissions may be left in an intermediate state.

**Expected behaviour:** Register signal handlers that drain the queue, wait for in-flight requests (with a timeout), and then exit cleanly.

---

### Issue #58 — Backend `tsconfig.json` does not set `moduleResolution` explicitly

**Area:** `apps/backend/tsconfig.json`
**Priority:** Low
**Type:** Build Configuration

**Description:**
`tsconfig.json` sets `"module": "ESNext"` without explicitly setting `moduleResolution`, causing potential import resolution inconsistencies between `tsx` dev runs and compiled output.

**Expected behaviour:** Explicitly set `"moduleResolution": "node16"` to match the Node.js ESM runtime environment.

---

### Issue #59 — No end-to-end integration test between backend oracle and a local Stellar node

**Area:** `apps/backend/tests/integration/`
**Priority:** High
**Type:** Testing Gap

**Description:**
The `tests/integration/` directory exists but contains no tests that exercise the full flow: deploy contracts → create match → deposit → oracle submits result → finalize → verify balances against a local standalone Stellar node.

**Expected behaviour:** Implement at least one integration test using `stellar-sdk` against a local standalone node covering the complete match lifecycle.

---

### Issue #60 — No Prometheus metrics endpoint in the backend

**Area:** `apps/backend/src/`
**Priority:** Low
**Type:** Observability

**Description:**
There is no `/metrics` endpoint exposing operational counters: jobs processed, jobs failed, retries, RPC latency. Without metrics it is impossible to alert on degradation proactively.

**Expected behaviour:** Add a Prometheus-compatible `/metrics` endpoint using `prom-client` exposing `oracle_jobs_total`, `oracle_jobs_failed_total`, `oracle_rpc_duration_seconds`.

---

### Issue #61 — No CORS configuration on the backend API

**Area:** `apps/backend/src/app.ts`
**Priority:** Medium
**Type:** Security

**Description:**
The Express app does not configure CORS headers, either blocking legitimate browser-based frontends or allowing any origin. Neither is acceptable for production.

**Expected behaviour:** Configure `cors` middleware with an explicit allowed-origins list from environment variables, defaulting to the frontend URL in production.

---

### Issue #62 — Backend `package.json` uses caret ranges instead of exact dependency versions

**Area:** `apps/backend/package.json`
**Priority:** Low
**Type:** Build Reproducibility

**Description:**
Dependencies like `"express": "^4.18.3"` allow minor and patch updates on fresh installs, which can introduce breaking changes silently. Smart contract–adjacent services should pin exact versions for deterministic builds.

**Expected behaviour:** Replace all `^` prefixes with exact versions in `package.json`.

---

## Frontend

### Issue #63 — `vite.config.ts` sets `css: false` in tests, masking missing CSS file import errors

**Area:** `apps/frontend/vite.config.ts`
**Priority:** Medium
**Type:** Testing / Configuration

**Description:**
`css: false` in the Vitest config suppresses CSS processing errors. If a component imports a CSS module that does not exist, the test silently succeeds rather than failing. This masked a real missing CSS import previously.

**Expected behaviour:** Either enable CSS processing in tests or add a lint rule that fails CI if any component imports a non-existent CSS file.

---

### Issue #64 — `CreateMatch.tsx` has no client-side validation for stake amount bounds

**Area:** `apps/frontend/src/components/CreateMatch.tsx`
**Priority:** Medium
**Type:** UX / Input Validation

**Description:**
The form accepts any numeric stake amount. Validation only happens on-chain, so users entering `0` or an out-of-range value receive no feedback until the transaction is rejected. Client-side validation of `MIN_STAKE` and `MAX_STAKE` provides immediate, clear feedback.

**Expected behaviour:** Validate `stake_amount` is between 1 stroop and 10_000_000_000_000 stroops before enabling submit, with an inline error message.

---

### Issue #65 — `MatchStatus.tsx` does not show dispute window countdown for `PendingResult` matches

**Area:** `apps/frontend/src/components/MatchStatus.tsx`
**Priority:** Medium
**Type:** UX

**Description:**
When a match is in `PendingResult` state, there is no countdown showing how much time remains before `finalize_result` can be called. Players have no way to know when their payout will be available.

**Expected behaviour:** Display a human-readable countdown (e.g. "Payout available in ~18 hours") computed from `pending_result_ledger + DISPUTE_WINDOW_LEDGERS - current_ledger × 5 seconds`.

---

### Issue #66 — `DepositStake.tsx` does not check token allowance before showing the deposit button as enabled

**Area:** `apps/frontend/src/components/DepositStake.tsx`
**Priority:** Medium
**Type:** UX

**Description:**
The deposit button is shown as enabled even when the user has not approved the escrow contract to spend their tokens. Clicking it results in an `InsufficientAllowance` on-chain error. An "Approve" step should precede the deposit.

**Expected behaviour:** Check `token.allowance(player, escrow_contract)` before enabling the deposit button. If insufficient, show an "Approve Token" button first.

---

### Issue #67 — Frontend does not detect external wallet disconnection events

**Area:** `apps/frontend/src/hooks/useStellarWallet.ts`
**Priority:** Medium
**Type:** UX / Bug

**Description:**
If a user disconnects their Freighter wallet externally while the app is open, the frontend wallet state remains `connected`, causing all subsequent transactions to fail silently.

**Expected behaviour:** Subscribe to Freighter wallet change events and transition to `disconnected` state immediately upon external disconnection.

---

### Issue #68 — Transaction hash after success is not a clickable explorer link

**Area:** `apps/frontend/src/components/claim-burn.tsx`
**Priority:** Low
**Type:** UX

**Description:**
After a successful claim or burn, the transaction hash is displayed as truncated plain text. Users cannot inspect the transaction without manually copying it.

**Expected behaviour:** Wrap the hash in an anchor tag pointing to `https://stellar.expert/explorer/{network}/tx/{hash}`, opening in a new tab.

---

### Issue #69 — No React `ErrorBoundary` — a component throw crashes the entire app

**Area:** `apps/frontend/src/App.tsx`
**Priority:** High
**Type:** Reliability / UX

**Description:**
There is no `ErrorBoundary` wrapping the application. Any unhandled component render exception causes the entire tree to unmount, leaving the user on a blank screen with no recovery option.

**Expected behaviour:** Wrap the app in an `ErrorBoundary` that catches render errors, logs them, and displays a user-friendly fallback UI with a "Reload" button.

---

### Issue #70 — `NetworkBanner` has an unnecessary `typeof import.meta` guard for a Vite build

**Area:** `apps/frontend/src/components/NetworkBanner.tsx`
**Priority:** Low
**Type:** Code Quality

**Description:**
The `typeof import.meta !== 'undefined'` guard is dead code in a Vite build where `import.meta.env` is statically replaced at compile time. It adds noise and misleads readers.

**Expected behaviour:** Simplify to `const EXPECTED_NETWORK = import.meta.env.VITE_STELLAR_NETWORK ?? 'testnet'`.

---

### Issue #71 — `CreateMatch.test.tsx` has no tests for invalid `game_id` inputs

**Area:** `apps/frontend/tests/CreateMatch.test.tsx`
**Priority:** Low
**Type:** Testing Gap

**Description:**
No tests cover an empty `game_id`, a `game_id` over 64 characters, or a duplicate `game_id`, verifying that the correct inline error message is shown in each case.

---

### Issue #72 — `onSwitchNetwork` callback is a no-op placeholder — network switching is unimplemented

**Area:** `apps/frontend/src/hooks/useStellarWallet.ts`
**Priority:** Medium
**Type:** Feature Gap

**Description:**
When `walletState === 'wrongNetwork'`, the switch-network button calls `onSwitchNetwork`, but the callback is not implemented to actually call any Freighter API.

**Expected behaviour:** Implement `onSwitchNetwork` to call the Freighter API to prompt the user to switch to the correct network.

---

### Issue #73 — `MatchStatus.tsx` does not poll for state updates — requires manual page refresh

**Area:** `apps/frontend/src/components/MatchStatus.tsx`
**Priority:** Medium
**Type:** UX

**Description:**
Match state is fetched once on mount. Players watching an active match must manually refresh to see oracle submissions or payout completions.

**Expected behaviour:** Poll match state every 10 seconds, stopping when a terminal state (`Completed` or `Cancelled`) is reached.

---

### Issue #74 — Frontend is served without Content Security Policy headers

**Area:** Deployment configuration
**Priority:** Medium
**Type:** Security

**Description:**
No CSP headers are configured. For a financial application handling wallet interactions, CSP is essential to prevent XSS attacks from injecting scripts that could steal signed transactions.

**Expected behaviour:** Configure CSP in deployment configuration restricting scripts to `'self'` and known CDN hashes, blocking inline scripts.

---

### Issue #75 — Wallet connection preference is not persisted to `localStorage`

**Area:** `apps/frontend/src/hooks/useWallet.ts`
**Priority:** Low
**Type:** UX

**Description:**
Reloading the page always starts in `disconnected` state, requiring users to reconnect manually every session. Most DeFi apps persist the connection preference and auto-reconnect on load.

**Expected behaviour:** Store `wallet_connected: true` in `localStorage` and auto-reconnect on load using Freighter's `isConnected()` API.

---

### Issue #76 — `DepositStake.test.tsx` missing test for disabled state during in-flight transaction

**Area:** `apps/frontend/tests/DepositStake.test.tsx`
**Priority:** Low
**Type:** Testing Gap

**Description:**
No test verifies that the deposit button is disabled and shows a loading indicator while a deposit transaction is in flight, leaving a potential double-submit race condition undetected.

---

### Issue #77 — `tailwind.config.ts` is an empty object — may cause incorrect CSS purging

**Area:** `apps/frontend/tailwind.config.ts`
**Priority:** Low
**Type:** Build Configuration

**Description:**
`tailwind.config.ts` exports `{}` with no content paths. This may cause incorrect CSS purging behaviour or inclusion of unused utility classes depending on how Tailwind v4 handles an explicitly provided empty config.

**Expected behaviour:** Either delete the file entirely (letting Tailwind v4 auto-detect) or configure it explicitly for the project structure.

---

### Issue #78 — All frontend components are eagerly imported — no route-level code splitting

**Area:** `apps/frontend/src/App.tsx`
**Priority:** Low
**Type:** Performance

**Description:**
All page and component imports in `App.tsx` are static, downloading the entire app bundle even for users visiting only the home page. Large wallet SDK dependencies significantly inflate initial load time.

**Expected behaviour:** Use `React.lazy` and `Suspense` for route-level components.

---

### Issue #79 — `Toast.tsx` auto-dismiss `setTimeout` is not cleaned up on component unmount

**Area:** `apps/frontend/src/components/Toast.tsx`
**Priority:** Low
**Type:** Bug / Memory Leak

**Description:**
The auto-dismiss timeout set in `ToastProvider` is not cleared in a `useEffect` cleanup function. If the component unmounts before the timeout fires, calling `setState` on the unmounted component triggers a React warning and is a memory leak.

**Expected behaviour:** Store timeout IDs and call `clearTimeout` in the `useEffect` return function.

---

### Issue #80 — No loading skeleton while fetching match data from the Stellar RPC

**Area:** `apps/frontend/src/components/MatchStatus.tsx`
**Priority:** Low
**Type:** UX

**Description:**
While match data is loading, the component renders nothing, causing a jarring layout shift when data arrives.

**Expected behaviour:** Render an `animate-pulse` skeleton placeholder matching the loaded match card layout.

---

### Issue #81 — `RegistrationForm.tsx` inputs are missing accessible `<label>` elements

**Area:** `apps/frontend/src/components/forms/RegistrationForm.tsx`
**Priority:** Medium
**Type:** Accessibility

**Description:**
Form inputs are rendered without `<label htmlFor="...">` elements linked by `id`. Screen readers cannot associate labels with controls, making the form inaccessible.

**Expected behaviour:** Add a `<label htmlFor="field-id">` for every input with matching `id` on the input element.

---

### Issue #82 — All user-facing strings are hardcoded in English with no i18n infrastructure

**Area:** `apps/frontend/src/`
**Priority:** Low
**Type:** Internationalisation

**Description:**
Chess is a global sport. All strings being hardcoded in English makes future translation a large, risky refactor.

**Expected behaviour:** Introduce `react-i18next` and extract all user-facing strings to locale JSON files, even if only English is supported initially.

---

### Issue #83 — No 404 catch-all route in the frontend router

**Area:** `apps/frontend/src/App.tsx`
**Priority:** Low
**Type:** UX

**Description:**
Navigating to an undefined route renders a blank page with no user feedback.

**Expected behaviour:** Add a wildcard `*` route rendering a styled `NotFound` component with a link back to the home page.

---

### Issue #84 — `History.tsx` fetches all matches at once with no pagination

**Area:** `apps/frontend/src/pages/History.tsx`
**Priority:** Medium
**Type:** Performance / UX

**Description:**
Match history is fetched in a single call. As match count grows, this produces large payloads, long load times, and potential RPC timeouts.

**Expected behaviour:** Implement cursor-based pagination using `list_matches(start, limit)`, with "Load more" or infinite-scroll controls.


---

## Infrastructure & Deployment

### Issue #85 — `deploy_testnet.sh` does not verify the deployer account has sufficient XLM before deploying

**Area:** `scripts/deploy_testnet.sh`
**Priority:** Medium
**Type:** Operational Safety

**Description:**
The deploy script runs `stellar contract deploy` without first checking that the deployer account holds enough XLM to cover contract upload fees and minimum balance requirements. A failed deployment mid-script can leave the contract registry in a partially initialised state.

**Expected behaviour:** Add a preflight balance check: query the deployer account balance via Horizon and fail fast with a clear error message if the balance is below a safe threshold (e.g. 10 XLM).

---

### Issue #86 — Deployment scripts do not save deployed contract IDs to a versioned manifest file

**Area:** `scripts/deploy_testnet.sh`, `scripts/deploy_mainnet.sh`
**Priority:** Medium
**Type:** Operations / Reproducibility

**Description:**
After deploying, the contract IDs are printed to stdout but not saved anywhere persistent. Re-running the deployment scripts or sharing addresses with team members requires either re-deploying or manually copying IDs from terminal history.

**Expected behaviour:** Write deployed contract addresses to a `deployments/{network}.json` manifest file after each successful deployment, committing the testnet manifest to the repository.

---

### Issue #87 — `deploy_mainnet.sh` does not require explicit confirmation before executing

**Area:** `scripts/deploy_mainnet.sh`
**Priority:** High
**Type:** Operational Safety

**Description:**
`deploy_mainnet.sh` deploys directly to the Stellar mainnet without any interactive confirmation prompt. A developer accidentally running the script could deploy unintended contract versions to production.

**Expected behaviour:** Add a `read -p "Deploy to MAINNET? This is irreversible. Type 'yes' to continue: "` confirmation gate at the top of the script that aborts if the user does not type exactly `yes`.

---

### Issue #88 — `environments.toml` does not include a `[standalone]` local development section

**Area:** `environments.toml`
**Priority:** Low
**Type:** Developer Experience

**Description:**
`environments.toml` has sections for `testnet`, `mainnet`, and `futurenet` but is missing a `[standalone]` section for local development using `stellar network start`. Developers running a local sandbox have to manually construct CLI flags or maintain local environment overrides.

**Expected behaviour:** Add a `[standalone]` section with standard local network values (`network_passphrase = "Standalone Network ; February 2017"`, `rpc_url = "http://localhost:8000/soroban/rpc"`).

---

### Issue #89 — CI `coverage` job installs `cargo-tarpaulin` from scratch on every run

**Area:** `.github/workflows/ci.yml` — `coverage` job
**Priority:** Low
**Type:** CI Performance

**Description:**
The `coverage` job runs `cargo install cargo-tarpaulin --locked` on every CI run, taking 2–5 minutes to compile. Using a GitHub Actions cache or a pre-built binary action would cut this to seconds.

**Expected behaviour:** Use `taiki-e/install-action@cargo-tarpaulin` or cache the compiled binary between runs using `actions/cache` with a key based on the tarpaulin version.

---

### Issue #90 — CI does not run the Python `validate_environments.py` tests on pull requests to non-master branches

**Area:** `.github/workflows/ci.yml`
**Priority:** Low
**Type:** CI Coverage

**Description:**
The `validate-environments` CI job runs `python scripts/test_validate_environments.py`, but CI is only triggered on push/PR to `master`. Feature branches modifying `environments.toml` won't have their changes validated until they are merged, making CI feedback too late.

**Expected behaviour:** Trigger CI on all branches (or at minimum all pull requests), not just `master`.

---

### Issue #91 — No Dependabot configuration for Rust (Cargo) dependencies

**Area:** `.github/dependabot.yml`
**Priority:** Low
**Type:** Security / Maintenance

**Description:**
`dependabot.yml` configures automated updates for npm packages but not for Cargo dependencies. Soroban SDK and other Rust crates may receive security patches that would go unnoticed without automated dependency update PRs.

**Expected behaviour:** Add a Cargo ecosystem entry to `dependabot.yml`:
```yaml
- package-ecosystem: "cargo"
  directory: "/"
  schedule:
    interval: "weekly"
```

---

### Issue #92 — CI `fmt` job does not check Rust formatting for the `contract-registry` crate

**Area:** `.github/workflows/ci.yml` — `fmt` job
**Priority:** Low
**Type:** CI Coverage

**Description:**
`cargo fmt -- --check` runs across the workspace, which should include all crates. However if `contract-registry/src/lib.rs` has formatting issues they would be caught. The real gap is that there is no `rustfmt.toml` config file defining project-wide formatting rules, so developers using different editor settings produce inconsistently formatted PRs.

**Expected behaviour:** Add a `rustfmt.toml` at the workspace root with agreed settings (e.g. `edition = "2021"`, `max_width = 100`) and document it in `CONTRIBUTING.md`.

---

### Issue #93 — No staging environment between testnet and mainnet

**Area:** Infrastructure / Deployment
**Priority:** Medium
**Type:** Operations

**Description:**
The project has testnet and mainnet environments but no dedicated staging environment. This means mainnet deployments are only validated against testnet, which may have different network conditions, ledger timing, and token contract behaviour.

**Expected behaviour:** Define a staging environment in `environments.toml` using Stellar futurenet (or a separate testnet deployment) and update CI/CD to run integration tests against staging before any mainnet deployment gate.

---

### Issue #94 — `audit.yml` workflow does not fail on HIGH severity vulnerabilities

**Area:** `.github/workflows/audit.yml`
**Priority:** Medium
**Type:** Security

**Description:**
The `audit.yml` workflow runs `cargo audit` but may not be configured to fail the build on HIGH or CRITICAL severity advisories. If the fail threshold is set too low (or not set at all), known vulnerabilities could be merged without blocking review.

**Expected behaviour:** Ensure `cargo audit` is run with `--deny warnings` or equivalent to fail CI on any unfixed advisory at HIGH severity or above.

---

### Issue #95 — No secret scanning configured for the repository

**Area:** `.github/` / Repository Settings
**Priority:** High
**Type:** Security

**Description:**
There is no GitHub secret scanning or `gitleaks` pre-commit hook configured. A developer accidentally committing a Stellar secret key, Lichess API token, or Chess.com API key to the repository would not be caught before the commit is pushed.

**Expected behaviour:** Enable GitHub's built-in secret scanning on the repository and add a `gitleaks` pre-commit hook (or `.gitleaks.toml` config) to catch secrets before they reach the remote.

---

### Issue #96 — WASM artifacts are not reproducibly built — different machines may produce different hashes

**Area:** `scripts/build.sh`, `.github/workflows/ci.yml`
**Priority:** Medium
**Type:** Build Reproducibility / Security

**Description:**
The WASM build is not pinned to a Docker image or specific toolchain environment. Rust WASM builds can differ between machines based on OS, LLVM version, and linker. Contract users who want to verify the deployed bytecode matches the source code cannot do so reliably.

**Expected behaviour:** Use a pinned Docker image (e.g. `stellar/soroban-tools:22.x.y`) for all WASM builds and document the verification procedure in `docs/deployment.md`.

---

### Issue #97 — `deny.toml` does not configure `[advisories]` section to deny unmaintained crates

**Area:** `deny.toml`
**Priority:** Low
**Type:** Security / Maintenance

**Description:**
`deny.toml` exists but its `[advisories]` configuration is unknown. If it does not deny unmaintained crates (`unmaintained = "deny"`), dependencies that are no longer receiving security patches can accumulate silently.

**Expected behaviour:** Set `unmaintained = "deny"` and `unsound = "deny"` in the `[advisories]` section of `deny.toml`.

---

## Security

### Issue #98 — `emergency_drain` can be called by the admin to steal all player funds while the contract is paused

**Area:** `contracts/escrow/src/lib.rs` — `emergency_drain`
**Priority:** High
**Type:** Security / Trust Model

**Description:**
`emergency_drain` transfers the entire contract token balance to any address specified by the admin while the contract is paused. This means the admin is a single point of trust: a compromised or malicious admin can pause the contract and drain all player stakes. The threat model document does not explicitly call this out as a known risk with mitigations.

**Expected behaviour:** Document this risk clearly in `docs/security.md` and `docs/threat-model.md`. Consider requiring a multi-sig or time-lock mechanism for `emergency_drain`, or restricting the drain destination to a pre-registered safe address rather than an arbitrary `to` parameter.

---

### Issue #99 — Oracle address is a single key — no multi-sig or threshold signing for result submission

**Area:** `contracts/escrow/src/lib.rs`, `contracts/oracle/src/lib.rs`
**Priority:** High
**Type:** Security / Trust Model

**Description:**
The oracle that submits match results is a single Stellar account. If the oracle's private key is compromised, an attacker can submit fraudulent results for all active matches, diverting all staked funds. There is no threshold signature or multi-party verification.

**Expected behaviour:** Design a multi-oracle pattern where at least 2 of N independent oracle services must agree on a result before it is accepted on-chain, or use a Stellar multi-sig account for the oracle address requiring M-of-N signatures.

---

### Issue #100 — No maximum number of concurrent active matches per player

**Area:** `contracts/escrow/src/lib.rs` — `create_match`
**Priority:** Medium
**Type:** Security / Anti-Abuse

**Description:**
A single player can create an unlimited number of concurrent matches. An attacker could create thousands of matches with low stakes to DoS the oracle service (flooding it with games to monitor) or to exhaust the `MatchCount` counter faster than expected.

**Expected behaviour:** Add a per-player active-match limit (e.g. 10 concurrent active/pending matches) enforced on-chain, tracked via a `PlayerMatchCount(Address)` storage key.

---

### Issue #101 — `game_id` is accepted from `player1` without verifying the game exists on the platform before creating the match

**Area:** `contracts/escrow/src/lib.rs` — `create_match`
**Priority:** Medium
**Type:** Security / UX

**Description:**
A player can create a match with any arbitrary `game_id` string, even one that does not correspond to a real game on Lichess or Chess.com. The oracle will later fail to find the game, the match will eventually time out, and funds will be locked for 7 days unnecessarily.

**Expected behaviour:** The oracle backend should validate the game exists and is in progress before the frontend allows `create_match` to be submitted. Add a `/validate-game` backend endpoint that checks the platform API before the frontend calls `create_match`.

---

### Issue #102 — Stellar account minimum balance not accounted for in stake amounts

**Area:** `contracts/escrow/src/lib.rs`
**Priority:** Medium
**Type:** Security / Correctness

**Description:**
On Stellar, every account must maintain a minimum balance (base reserve × entries). When calculating payouts, the contract transfers `stake_amount × 2` without checking whether the contract account balance would drop below the minimum reserve. If the contract holds exactly the expected stake amount with no buffer, the transfer could fail.

**Expected behaviour:** Add a buffer on deployment (e.g. 1 XLM admin top-up) and document the minimum required contract balance, or use `token.balance()` pre-checks before transfers.

---

### Issue #103 — `transfer_admin` does not emit an event with the old admin address for audit trails

**Area:** `contracts/oracle/src/lib.rs` — `transfer_admin`
**Priority:** Low
**Type:** Security / Observability

**Description:**
Oracle `transfer_admin` emits `(admin, new_admin)` — actually it does include the old admin in the event data. However, the escrow's `transfer_admin` emits `(current_admin, new_admin)`. Both are fine, but the escrow event uses `symbol_short!("transfer")` which is truncated to 7 characters, potentially colliding with other `transfer` events from token contracts in event log parsers.

**Expected behaviour:** Use a more specific event topic like `symbol_short!("adm_xfr")` on the escrow contract to avoid collisions with standard SEP-41 token `transfer` events.

---

### Issue #104 — No on-chain check that `player1` and `player2` are not contract addresses

**Area:** `contracts/escrow/src/lib.rs` — `create_match`
**Priority:** Low
**Type:** Security

**Description:**
`player1` and `player2` could be contract addresses. If a malicious contract is registered as a player, its `receive` function could execute arbitrary logic when the payout transfer is made, potentially causing a re-entrancy-style attack (though Soroban's execution model limits this risk).

**Expected behaviour:** Document in the security model why this is or is not a risk under Soroban's execution model, and consider adding a note that player addresses should be user (classic) accounts.

---

## Documentation

### Issue #105 — `README.md` state machine diagram is outdated — does not show `PendingResult` state

**Area:** `README.md`
**Priority:** Medium
**Type:** Documentation

**Description:**
The README's match state machine diagram shows `Active → Completed` directly via `submit_result()`. The actual implementation adds a `PendingResult` intermediate state with a dispute window, followed by `finalize_result()` triggering `Completed`. The diagram misleads developers and users about how payouts work.

**Expected behaviour:** Update the README state machine diagram to accurately reflect the current flow including `PendingResult`, `override_result()`, and `finalize_result()`.

---

### Issue #106 — `docs/oracle.md` does not document the off-chain oracle service polling interval or job scheduling

**Area:** `docs/oracle.md`
**Priority:** Low
**Type:** Documentation

**Description:**
`docs/oracle.md` describes the oracle architecture at a high level but does not explain how frequently the oracle polls for game results, what happens when a game takes longer than expected, or how the polling interval relates to the 7-day timeout.

**Expected behaviour:** Document the polling interval (configurable, default suggested), the retry policy, and the relationship between polling frequency and the `TIMEOUT_LEDGERS` constant.

---

### Issue #107 — `docs/deployment.md` does not include a step for verifying the deployed WASM hash against the source

**Area:** `docs/deployment.md`
**Priority:** Medium
**Type:** Documentation / Security

**Description:**
`docs/deployment.md` describes deployment steps but does not include a verification step where the deployer confirms the on-chain WASM hash matches the locally compiled artifact. This is a critical step for a financial contract.

**Expected behaviour:** Add a "Verify deployment" section with instructions to compare `stellar contract inspect --wasm-hash <hash>` output against the locally computed SHA-256 of the WASM artifact.

---

### Issue #108 — No `SECURITY.md` policy for responsible disclosure of vulnerabilities

**Area:** `SECURITY.md` / Repository
**Priority:** High
**Type:** Security / Documentation

**Description:**
There is a `SECURITY.md` file but it needs to include: a clear responsible disclosure contact (email or GitHub Security Advisory), a timeline commitment for response and patch, and guidance on what constitutes an in-scope vulnerability (smart contract bugs, oracle manipulation, frontend XSS).

**Expected behaviour:** Review and update `SECURITY.md` to follow the standard responsible disclosure template with a contact address, response SLA, and scope definition.

---

### Issue #109 — `docs/architecture.md` does not document the contract registry contract

**Area:** `docs/architecture.md`
**Priority:** Low
**Type:** Documentation

**Description:**
`docs/architecture.md` covers the escrow and oracle contracts but does not mention the `contract-registry` contract. Its purpose, deployment relationship to the other contracts, and API are undocumented.

**Expected behaviour:** Add a section to `docs/architecture.md` explaining the contract registry's role, its `register` / `get` / `list` API, and how it is used by the deployment scripts and frontend.

---

### Issue #110 — `CONTRIBUTING.md` does not specify the required Rust toolchain version for local development

**Area:** `CONTRIBUTING.md`
**Priority:** Low
**Type:** Documentation / Developer Experience

**Description:**
`CONTRIBUTING.md` mentions running `cargo test` but does not tell contributors which Rust version to install. `rust-toolchain.toml` pins to `1.88.0` with `wasm32-unknown-unknown`, but new contributors who have not read the toolchain file may compile with the wrong version and get confusing errors.

**Expected behaviour:** Add an explicit "Prerequisites" section to `CONTRIBUTING.md` stating the required Rust version, the `wasm32-unknown-unknown` target, and how to install both using `rustup`.

---

### Issue #111 — `docs/runbook.md` does not document the procedure for handling a compromised oracle key

**Area:** `docs/runbook.md`
**Priority:** High
**Type:** Documentation / Incident Response

**Description:**
The runbook covers general operational procedures but does not include a step-by-step response plan for a compromised oracle signing key. Given that the oracle is a single point of trust (see Issue #99), the incident response for key compromise is the most critical procedure to document.

**Expected behaviour:** Add an "Oracle key compromise" runbook entry: (1) pause the escrow contract immediately, (2) call `update_oracle` with a new safe address, (3) audit all `submit_result` events since the compromise date, (4) for any fraudulent results, call `override_result` during the dispute window, (5) unpause.

---

### Issue #112 — No `CHANGELOG.md` entries for changes made after the initial commits

**Area:** `CHANGELOG.md`
**Priority:** Low
**Type:** Documentation

**Description:**
`CHANGELOG.md` exists but may not reflect recent changes (e.g. the addition of `PendingResult` state, `claim_timeout`, `override_result`, `emergency_drain`, stake limits). Outdated changelogs mislead integrators about when breaking changes were introduced.

**Expected behaviour:** Update `CHANGELOG.md` with an `[Unreleased]` section documenting all changes since the last tagged release, following [Keep a Changelog](https://keepachangelog.com) format.

---

### Issue #113 — No inline code comments explaining why `NotFunded` check exists in `submit_result`

**Area:** `contracts/escrow/src/lib.rs` — `submit_result`
**Priority:** Low
**Type:** Code Documentation

**Description:**
The `NotFunded` guard in `submit_result` is unreachable by design (a match can only be `Active` if both players deposited), but this is not explained in a comment. Future readers may remove it thinking it's dead code, or conversely waste time investigating whether it's reachable.

**Expected behaviour:** Add a comment: `// Invariant: Active state implies both players have deposited. This check is a defensive guard.`

---

### Issue #114 — `docs/api-reference.md` does not document the `list_matches` and `list_results` pagination parameters

**Area:** `docs/api-reference.md`
**Priority:** Low
**Type:** Documentation

**Description:**
`list_matches` and `list_results` accept `start` and `limit` parameters for pagination, but the API reference does not document the cap (100), the behaviour when `start > match_count`, or how to detect the last page.

**Expected behaviour:** Add pagination documentation for both functions including: the cap value, the meaning of an empty return value, and a code example showing iterative pagination.

---

### Issue #115 — No architecture decision record (ADR) documenting the choice of `PendingResult` dispute window

**Area:** `docs/`
**Priority:** Low
**Type:** Documentation

**Description:**
The 24-hour dispute window (`DISPUTE_WINDOW_LEDGERS = 17_280`) is a critical design decision that affects user experience and security. There is no document explaining why 24 hours was chosen, what alternatives were considered, and what the trade-offs are.

**Expected behaviour:** Create `docs/adr/001-dispute-window.md` explaining the decision, alternatives considered, and the rationale for 24 hours vs shorter/longer windows.

---

## Testing

### Issue #116 — No fuzz testing for `create_match` input validation

**Area:** `contracts/escrow/src/`
**Priority:** Medium
**Type:** Testing / Security

**Description:**
`create_match` validates several inputs (`stake_amount`, `game_id` length, player addresses). These validations are only tested with hand-picked values. Fuzz testing with random inputs would reveal edge cases in the validation logic that unit tests miss.

**Expected behaviour:** Add a `#[cfg(fuzzing)]` fuzz target using `cargo-fuzz` or `afl` that generates random `stake_amount`, `game_id`, and address inputs and asserts the contract either succeeds or returns a known-valid error code (not a panic).

---

### Issue #117 — Test coverage for `contract-registry` is minimal — only 4 tests

**Area:** `contracts/contract-registry/src/test.rs`
**Priority:** Medium
**Type:** Testing Gap

**Description:**
The contract registry has only 4 tests covering basic auth and error cases. There are no tests for: registering the maximum number of entries, querying a non-existent contract by name, listing all registered contracts, or pausing the registry.

**Expected behaviour:** Expand `test.rs` to cover all public functions with both happy-path and error-path cases, targeting at least 80% branch coverage.

---

### Issue #118 — No property-based tests for the escrow state machine transitions

**Area:** `contracts/escrow/src/tests.rs`
**Priority:** Medium
**Type:** Testing

**Description:**
The state machine has strict transition rules. Unit tests cover specific paths but not exhaustive combinations. A property-based test that generates random sequences of contract calls and asserts that invalid transitions always return `Error::InvalidState` (and valid ones succeed) would provide stronger correctness guarantees.

**Expected behaviour:** Use `proptest` or a similar library to generate random call sequences and verify the state machine invariants hold in all cases.

---

### Issue #119 — E2E tests in `tests_e2e.rs` do not test the `override_result` → `finalize_result` path

**Area:** `contracts/escrow/src/tests_e2e.rs`
**Priority:** Medium
**Type:** Testing Gap

**Description:**
`tests_e2e.rs` covers the main flow including `submit_result` and `finalize_result`. There are no end-to-end tests that exercise `override_result` changing the winner, followed by `finalize_result`, verifying the overridden winner receives the payout.

**Expected behaviour:** Add an E2E test: submit Player1 wins → admin overrides to Player2 wins → wait for dispute window → finalize → assert Player2 received funds.

---

### Issue #120 — No test for concurrent deposits from both players in the same transaction (impossible but worth documenting)

**Area:** `contracts/escrow/src/tests.rs`
**Priority:** Low
**Type:** Testing / Documentation

**Description:**
Soroban processes transactions atomically and sequentially, so true concurrent deposits are impossible. However, the scenario where both players submit deposits in quick succession and one succeeds while the other is replayed should be tested to confirm idempotency — the second deposit for the same player should return `AlreadyFunded`.

**Expected behaviour:** Add a test verifying that calling `deposit` twice for the same player on the same match in sequence returns `Err(Error::AlreadyFunded)` on the second call.

---

### Issue #121 — Frontend test for `MatchStatus.test.tsx` does not cover the `Cancelled` terminal state UI

**Area:** `apps/frontend/tests/MatchStatus.test.tsx`
**Priority:** Low
**Type:** Testing Gap

**Description:**
`MatchStatus.test.tsx` covers `Pending`, `Active`, `PendingResult`, and `Completed` states but there is no test for the `Cancelled` state UI, including the cancellation reason (cancelled by player vs timed out) and the refund display.

**Expected behaviour:** Add tests for `MatchStatus` rendering with `state: 'Cancelled'` covering both cancellation paths.

---

### Issue #122 — No snapshot tests for key UI components

**Area:** `apps/frontend/tests/`
**Priority:** Low
**Type:** Testing

**Description:**
There are no snapshot tests for components like `MatchStatus`, `CreateMatch`, or `ClaimBurn`. Snapshot tests catch unintended UI regressions when refactoring styles or JSX structure that behavioural tests would not catch.

**Expected behaviour:** Add Vitest snapshot tests for the primary rendered states of each major component using `expect(container).toMatchSnapshot()`.

---

### Issue #123 — `scripts/test.sh` does not run frontend and backend tests — only Rust tests

**Area:** `scripts/test.sh`
**Priority:** Medium
**Type:** Developer Experience

**Description:**
`scripts/test.sh` runs only `cargo test`. Developers running the test script locally get no indication of whether frontend or backend tests pass, giving a false sense of completeness before pushing.

**Expected behaviour:** Update `scripts/test.sh` to also run `npm test` in both `apps/frontend` and `apps/backend`, and exit with a non-zero code if any suite fails.

---

### Issue #124 — No test for `list_matches` returning an empty slice when `start >= match_count`

**Area:** `contracts/escrow/src/tests.rs`
**Priority:** Low
**Type:** Testing Gap

**Description:**
`list_matches` should return an empty slice when `start` is at or beyond the total match count. There is no test confirming this boundary condition, which is the standard "end of pagination" signal for callers.

**Expected behaviour:** Add a test: call `list_matches(0, 5)` on a contract with 3 matches, verify 3 IDs returned; call `list_matches(3, 5)`, verify empty slice returned.

---

### Issue #125 — CI does not enforce a minimum test coverage threshold on the frontend

**Area:** `.github/workflows/ci.yml` — `frontend` job
**Priority:** Medium
**Type:** CI / Testing

**Description:**
The CI `coverage` job enforces 80% test coverage for Rust code via `cargo-tarpaulin --fail-under 80`. There is no equivalent coverage threshold for the frontend TypeScript code. The frontend job runs `vitest run` but does not generate a coverage report or enforce a minimum threshold, allowing coverage to silently regress.

**Expected behaviour:** Add `--coverage` to the frontend `vitest run` command and configure `coverageThreshold` in `vite.config.ts` (e.g. 70% lines) to fail CI when frontend coverage drops below the threshold.
