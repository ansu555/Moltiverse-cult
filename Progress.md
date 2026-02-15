## Free-Will Rollout Program (Feb 2026)

### Rollout Status

| Rollout | Lane | Owner | Branch | Start | End | Status | Blockers | PR |
|---|---|---|---|---|---|---|---|---|
| R0 | A+B | Codex | feat/freewill-integration | 2026-02-15 | 2026-02-15 | ✅ completed | None | N/A |
| R1 | A+B | Codex | feat/freewill-integration | 2026-02-15 | 2026-02-15 | ✅ completed | Missing table grants for anon inserts (fixed with sequence/table grants) | N/A |
| R2 | A+B | Codex | feat/freewill-integration | 2026-02-15 | 2026-02-15 | ✅ completed | None | N/A |
| R3 | A | Codex | feat/freewill-integration | 2026-02-15 | 2026-02-15 | ✅ completed | None | N/A |
| R4 | B | Codex | feat/freewill-integration | 2026-02-15 | 2026-02-15 | ✅ completed | None | N/A |
| R5 | A | Codex | feat/freewill-integration | 2026-02-15 | 2026-02-15 | ✅ completed | None | N/A |
| R6 | Integration | Codex | feat/freewill-integration | 2026-02-15 | 2026-02-15 | ✅ completed | `test-integration.ts` governance phase previously hung; fixed via tx wait timeout helper | N/A |

### R0: Program Setup — Verification

Commands executed:
- `npm run contracts:test` → ✅ pass (`90 passing`)
- `cd agent && npm run build` → ✅ pass
- `npm run frontend:build` → ✅ pass (`next build --webpack`)
- `npx tsx scripts/test-workflow.ts --quick` → ✅ pass (`65/67 passed, 2 warnings, 0 failed`)

Outcome:
- Baseline behavior captured.
- Integration branch health confirmed.

### R1: Persistence Foundation — Verification

Artifacts:
- `scripts/sql/2026-02-15-freewill-rollout-r1.sql`

DB verification:
- `mcp run-raw-sql` table existence checks for:
  - `group_memberships`
  - `bribe_offers`
  - `leadership_elections`
  - plus planner and conversation tables
- Startup re-check with live backend:
  - No `42P01` warnings for required tables.

Fixes applied:
- Added missing tables + compatibility `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Added anon/authenticated grants for new tables and their sequences.
- Confirmed no startup `42501 permission denied for sequence ...` after grant fix.

### R2: DB-only World + ID Integrity — Verification

Scope checks:
- DB-backed rival filtering implemented via `agent/src/services/WorldStateService.ts`.
- Target resolution enforced via strict cult->agent mapping before meme/bribe/transfer writes.

Verification:
- Runtime log check: `rivals` reduced to DB-backed set (`2`, not historical full chain count).
- FK path validation: no `to_agent_id=0` write path remains in code.
- Build check: `cd agent && npm run build` → ✅ pass.

Outcome:
- `token_transfers` now use valid DB agent targets only.

### R3: Planner Core — Verification

Implemented:
- `agent/src/services/PlannerService.ts`
- `agent/src/types/planner.ts`
- planner persistence plumbing in `agent/src/services/InsForgeService.ts`
- planner routes and API mount

Verification:
- `cd agent && npm run build` → ✅ pass
- Live runtime logs show multi-step plans (`steps=3..5`), not fixed single-action fallback.
- Planner persistence query:
  - `GET /api/agents/1/plans?limit=5` → returns persisted runs.
  - `GET /api/agents/1/plans/:planId/steps` → returns step history/results.
- SSE events emitted:
  - `planner_step_started`
  - `planner_step_completed`
  - `planner_step_failed`

### R4: Threaded Communication + Frontend — Verification

Implemented:
- Thread/message persistence and APIs:
  - `GET /api/chat/threads`
  - `GET /api/chat/threads/:threadId/messages`
- Frontend threaded chat views + SSE handling.

Verification:
- `npm run frontend:build` → ✅ pass
- API checks:
  - `GET /api/chat/threads?limit=5` → ✅ returns thread list
  - `GET /api/chat/threads/1/messages?limit=10` → ✅ returns timeline
- Frontend workflow checks in quick test:
  - `/`, `/arena`, `/prophecies`, `/governance`, `/alliances`, `/cults` all HTTP 200

### R5: Contract V2 Raid Auth Migration — Verification

Implemented:
- `contracts/contracts/CultRegistry.sol`
  - `recordRaid(...)` now authorized by owner OR attacker cult leader (`onlyRaidReporter`).
- Updated tests in `contracts/test/CultRegistry.test.ts`.

Verification:
- `npm run contracts:test` → ✅ pass (`90 passing`)
- Coverage in tests includes:
  - attacker leader allowed
  - owner override allowed
  - unauthorized caller rejected

### R6: Integration + Connect All Rollouts — Verification

Full matrix:
- `npm run contracts:test` → ✅ pass (`90 passing`)
- `cd agent && npm run build` → ✅ pass
- `npm run frontend:build` → ✅ pass
- `npx tsx scripts/test-workflow.ts --quick` → ✅ pass (`65/67 passed, 0 failed, 2 warnings`)
- `npx tsx scripts/test-integration.ts` → ✅ pass (`197/197 passed`)

Stability fix during R6:
- `scripts/test-integration.ts` updated with `waitForTxWithTimeout(...)` in Suite 7 governance tx waits to avoid indefinite hangs and produce deterministic results.

### Integration Health Notes (`feat/freewill-integration`)

- 2026-02-15 checkpoint 1: baseline build/tests green except frontend Turbopack sandbox issue.
- 2026-02-15 checkpoint 2: frontend build path stabilized with webpack build script.
- 2026-02-15 checkpoint 3: DB grants fix removed startup persistence warnings.
- 2026-02-15 checkpoint 4: planner switched to true multi-step generation; runtime confirms multi-step outputs.
- 2026-02-15 checkpoint 5: full verification matrix green including end-to-end integration suite.

### Parallelization / Handoff Notes

Lane A handoff-ready areas:
- Contract evolution for further raid/governance auth policies.
- Planner strategy policy tuning (step scoring, long-horizon objectives).

Lane B handoff-ready areas:
- Frontend planner inspector views (`/agents/:id/plans` UX expansion).
- Thread filtering/search and replay tooling in chat UI.

Current integration status:
- All planned rollouts (R0-R6) are connected and verified on this branch.
