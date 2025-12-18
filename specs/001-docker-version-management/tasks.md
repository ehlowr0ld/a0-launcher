---

description: "Tasks for implementing Docker Version Management (Stage 1 Docker interface + Stage 2 feature)"
---

# Tasks: Docker Version Management (Two-Stage Delivery)

**Input**: Design documents from `specs/001-docker-version-management/`
**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Optional. Do not add automated test tasks unless explicitly requested in the feature spec.

**Organization**:
- **Stage 1** tasks implement the reusable Docker interface base class + one default implementation and then STOP.
- **Stage 2** tasks implement the "Service Versions" feature using only the Stage 1 interface (no direct Docker/registry protocol logic in Stage 2).

## Format: `T### [P?] [US?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[US#]**: Which user story this task belongs to (US1..US5). Only used in Stage 2 user story phases.
- Include exact file paths in descriptions

---

## Stage 1: Docker Interface Base Class (STOP checkpoint)

### Phase 1: Stage 1 Setup (DockerInterface module)

**Purpose**: Implement the ESM abstract base class and module loading strategy.

- [ ] T001 Create the ESM abstract base class in `shell/docker/DockerInterface.mjs` (JSDoc typedefs + abstract method stubs)
- [ ] T002 [P] Implement `detectEnvironment()` in `shell/docker/DockerInterface.mjs` (OS + docker availability + flavor best-effort; honor `DOCKER_HOST` parsing for `unix:`/`npipe:`/`tcp:`/`http(s):` where applicable)
- [ ] T003 [P] Implement `static async get()` singleton selector in `shell/docker/DockerInterface.mjs` (dynamic import of implementation modules; cache instance)
- [ ] T004 [P] Create default implementation skeleton in `shell/docker/impl/DockerodeDocker.mjs` (implements all abstract methods) and add `dockerode` to `package.json` (update `package-lock.json`)
- [ ] T005 [P] Create Docker Hub registry client in `shell/docker/impl/DockerHubRegistry.mjs` (token flow with `expires_in` handling + tags/list pagination `n`/`last` + `Link: ...; rel="next"` + HEAD manifest digest with stable `Accept` ordering; best-effort use the user's existing Docker registry auth context when available, with no in-app credential UI/storage; never log or return credential material)
- [ ] T006 [P] Add a CommonJS adapter in `shell/docker/getDocker.js` (exports `async function getDocker()` that loads `DockerInterface.mjs` via `import()` and returns the singleton)

### Phase 2: Stage 1 Default Implementation (DockerodeDocker)

**Purpose**: Deliver the full required Docker interface surface + best-effort cancellation semantics.

- [ ] T007 Implement `listRemoteTags(imageRepo)` in `shell/docker/impl/DockerHubRegistry.mjs` and expose via `shell/docker/impl/DockerodeDocker.mjs`
- [ ] T008 Implement `getRemoteDigest(imageRepo, tag)` in `shell/docker/impl/DockerHubRegistry.mjs` and expose via `shell/docker/impl/DockerodeDocker.mjs`
- [ ] T009 Implement `listLocalImages(imageRepo)` in `shell/docker/impl/DockerodeDocker.mjs` (tags + image id/digest + size + created)
- [ ] T010 Implement `removeLocalImage(imageRef)` in `shell/docker/impl/DockerodeDocker.mjs`
- [ ] T011 Implement `pullImage(imageRef)` with progress tracking in `shell/docker/impl/DockerodeDocker.mjs` (use dockerode `followProgress`; track in-flight pulls; tolerate events without totals/ids)
- [ ] T012 Implement best-effort pull cancellation in `shell/docker/impl/DockerodeDocker.mjs` (keep pull stream reference; cancel via `stream.destroy()`; mark aborted_client; document that daemon may continue)
- [ ] T013 Implement `listContainers(imageRepo)` in `shell/docker/impl/DockerodeDocker.mjs` (include tag + status/state)
- [ ] T014 Implement container lifecycle methods in `shell/docker/impl/DockerodeDocker.mjs` (create/start/stop/restart/delete/inspect with passed-in create params)
- [ ] T015 Implement structured error codes and environment diagnostics returned by `detectEnvironment()` in `shell/docker/DockerInterface.mjs` and `shell/docker/impl/DockerodeDocker.mjs` (daemon unavailable, permission denied, etc.; include rate-limit classification and preserve headers for backoff decisions)

### Stage 1 Checkpoint (MANDATORY STOP)

Stop development after completing Stage 1. At this point, the repo has a reusable Docker interface abstraction + one working default implementation, ready for downstream feature work.

---

## Stage 2: Docker Version Management Feature (uses Stage 1)

## Phase 3: Stage 2 Foundational (Blocking Prerequisites)

**Purpose**: Build the version-management domain using only the Stage 1 interface.

WARNING: No user story work can begin until this phase is complete.

- [ ] T016 Create Stage 2 module skeleton in `shell/service_versions/index.js` (uses `shell/docker/getDocker.js`; no direct dockerode/registry protocol code; define allowlisted image repo + tag validation helpers used by IPC boundary)
- [ ] T017 [P] Implement GitHub Releases client + caching in `shell/service_versions/releases_client.js` (semver list source; default cache TTL 24h; manual refresh forces re-check) and add `semver` to `package.json` (update `package-lock.json`)
- [ ] T018 [P] Implement persistence for retention + installability caches in `shell/service_versions/state_store.js` (userData JSON read/write)
- [ ] T019 [P] Implement instance naming and ordering helpers in `shell/service_versions/retention.js` (sanitize, retained-at timestamp, parse)
- [ ] T020 [P] Implement UI-safe error mapping in `shell/service_versions/errors.js` (map DockerInterface errors to non-technical messages)
- [ ] T021 Implement reconciliation and derived state in `shell/service_versions/index.js` (semver releases from GH validated via registry digest; first-class `testing`; `latest` badge; canonical local tags + custom local builds; digest match hints; divergence detection; installability caching: cache "not yet available" 15m, cache "installable" 24h; manual refresh forces re-check)
- [ ] T022 Implement single-operation concurrency guard in `shell/service_versions/index.js` (prevent overlapping install/update/activate/delete)

**Checkpoint**: Stage 2 foundation ready - user story implementation can now begin.

---

## Phase 4: User Story 1 - See What Is Running (Priority: P1) MVP

**Goal**: Provide a "Service Versions" screen that shows Active/Installed/Available/Update Available, first-class Testing preview, local builds, and retained instances, without exposing Docker terminology.

**Independent Test**: Open the "Service Versions" screen and verify correct status rendering (including empty state and retained instance list).

### Implementation for User Story 1

- [ ] T023 [P] [US1] Add IPC handlers in `shell/main.js` (invoke channels `service-versions:getState` and `service-versions:refresh`; map to `contracts/ipc.openapi.yaml` operationIds getServiceVersionsState + refreshServiceVersions; validate IPC inputs and outbound payload shape) returning derived state from `shell/service_versions/index.js`
- [ ] T024 [P] [US1] Expose `serviceVersionsAPI` in `shell/preload.js` (getState, refresh, installOrSync(tag), onStateChange/progress with unsubscribe)
- [ ] T025 [P] [US1] Implement Service Versions UI scaffolding in `app/index.html` + `app/service_versions.js` + `app/service_versions.css` with non-technical copy
- [ ] T026 [US1] Wire UI to state APIs in `app/service_versions.js` (render semver releases + Testing entry + latest badge; local builds section; retained instances; offline/runtime indicators; show "Update Available" indicator including the newest version number; suppress primary install/update actions when installability is known "not yet available"; avoid ambiguous labels like "Latest Release" without also showing the exact tag/version that will run)
- [ ] T027 [P] [US1] Implement install/sync operation in `shell/service_versions/index.js` using DockerInterface pull + registry validation (supports semver tags and canonical `testing`; caches installability; emits progress)
- [ ] T028 [US1] Wire install/sync IPC in `shell/main.js` + `shell/preload.js` and add install/sync actions + progress UI in `app/service_versions.js` (map to `contracts/ipc.openapi.yaml` operationId installServiceVersion; validate tag and enforce allowlisted image repo/tags at IPC boundary)
- [ ] T029 [P] [US1] Implement retention policy read/write in `shell/service_versions/state_store.js` (default keepCount=1) and wire setRetentionPolicy IPC in `shell/main.js` + `shell/preload.js` (map to `contracts/ipc.openapi.yaml` operationId setRetentionPolicy; validate keepCount 0..20 at IPC boundary)
- [ ] T030 [P] [US1] Implement delete retained instance operation in `shell/service_versions/index.js` (refuse delete of active; require containerId) and wire delete IPC + UI confirmation in `app/service_versions.js` (map to `contracts/ipc.openapi.yaml` operationId deleteRetainedInstance; validate containerId at IPC boundary)

**Checkpoint**: User Story 1 is functional and independently testable.

---

## Phase 5: User Story 2 - Update Without Extra Tools (Priority: P1)

**Goal**: Update to newest official release with a single action, with explicit data-loss warning and fail-safe behavior.

**Independent Test**: Trigger update available, confirm data-loss acknowledgement gate, confirm successful update makes the newest release Active, and rollback works when start fails.

### Implementation for User Story 2

- [ ] T031 [US2] Update IPC contract in `specs/001-docker-version-management/contracts/ipc.openapi.yaml` to include cancel + rollback/activate-retained operations (and document event channels)
- [ ] T032 [P] [US2] Implement updateToLatest(dataLossAck) in `shell/service_versions/index.js` (determine latest semver from GH; validate via registry digest; pull before stop; retain previous; enforce retention; fail-safe ordering)
- [ ] T033 [P] [US2] Implement active container create/start logic in `shell/service_versions/index.js` using DockerInterface container create/start/stop/inspect (no direct dockerode calls)
- [ ] T034 [US2] Wire update-to-latest IPC + preload method in `shell/main.js` and `shell/preload.js` (map to `contracts/ipc.openapi.yaml` operationId updateServiceToLatest; requires dataLossAck; validate enum at IPC boundary)
- [ ] T035 [US2] Implement data loss warning modal in `app/service_versions.js` (includes the exact target tag/version; choices: has_backup vs proceed_without_backup; cancel)
- [ ] T036 [US2] Implement rollback action from retained instances in `app/service_versions.js` and wire to rollback IPC (with explicit warning)
- [ ] T037 [US2] Implement cancel operation in `shell/service_versions/index.js` (best-effort cancel via DockerInterface for pulls), expose via `shell/main.js` + `shell/preload.js`, and wire Cancel UI in `app/service_versions.js`

**Checkpoint**: User Stories 1 and 2 both work end-to-end.

---

## Phase 6: User Story 3 - Install And Switch Versions (Priority: P2)

**Goal**: Install an older official version and activate it (switch versions).

**Independent Test**: Install a non-latest version and activate it; confirm Active changes and previous instance becomes retained.

### Implementation for User Story 3

- [ ] T038 [P] [US3] Implement activateVersion(tag, dataLossAck) in `shell/service_versions/index.js` (stop active; retain previous; start selected; enforce retention; uses DockerInterface)
- [ ] T039 [US3] Wire activate IPC + preload method in `shell/main.js` and `shell/preload.js` and connect "Use This Version" action in `app/service_versions.js` (map to `contracts/ipc.openapi.yaml` operationId activateServiceVersion; validate tag and dataLossAck at IPC boundary)
- [ ] T040 [US3] Update UI action state rules in `app/service_versions.js` (Installed vs Active vs Available vs Update Available; include first-class Testing preview; show exact version before activation; suppress primary install/update actions when installability is known "not yet available")

**Checkpoint**: User Story 3 is independently functional.

---

## Phase 7: User Story 4 - Developer Uses Local Builds Safely (Priority: P3)

**Goal**: Support canonical local tags (`local`, `development`, `testing`, `main`) and show other tags as custom local builds, with digest match hints and sync when appropriate.

**Independent Test**: Provide canonical local tags and custom tags; verify labeling, match hints, and sync action behavior.

### Implementation for User Story 4

- [ ] T041 [P] [US4] Extend reconciliation in `shell/service_versions/index.js` to classify local images into canonical local builds vs custom local builds and compute digest match hints against canonical remote tags (`vX.Y.Z`, `testing`, `latest`)
- [ ] T042 [US4] Update UI in `app/service_versions.js` to render canonical local builds distinctly and keep update prompts non-blocking when active is local_build
- [ ] T043 [US4] Add explicit "Sync" affordance in `app/service_versions.js` for canonical local tags that diverge from remote and wire to install/sync operation

**Checkpoint**: Developer/local build workflow is supported.

---

## Phase 8: User Story 5 - Works When Offline (Priority: P3)

**Goal**: Keep installed versions visible and switchable when offline, with clear offline indication.

**Independent Test**: Disable network, verify installed versions remain visible and switchable, and network-only actions are suppressed.

### Implementation for User Story 5

- [ ] T044 [P] [US5] Implement offline fallback + lastSyncedAt in `shell/service_versions/releases_client.js` (use cached releases; set offline flag)
- [ ] T045 [US5] Update UI in `app/service_versions.js` to display offline indicator (and last successful check time when known) and suppress network-only actions while keeping installed activation available
- [ ] T046 [US5] Ensure refresh behavior and error messages are user-friendly (no Docker terms) in `shell/service_versions/errors.js` and `app/service_versions.js`

**Checkpoint**: Offline mode meets the spec expectations.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting multiple user stories, plus security and UX hardening.

- [ ] T047 [P] Add storage usage reporting in `shell/service_versions/index.js` (via DockerInterface + best-effort filesystem info) and display it in `app/service_versions.js`
- [ ] T048 [P] Add "free space after update" estimate (explicitly labeled estimate) in `shell/service_versions/index.js` and surface it in `app/service_versions.js`
- [ ] T049 Update help/troubleshooting surface to isolate technical terms in `app/index.html` and update developer docs in `README.md`
- [ ] T050 Security hardening: audit and tighten IPC param validation and allowlist enforcement for repos/tags in `shell/main.js` and `shell/service_versions/index.js` (ensure all handlers already validate; add extra defense-in-depth checks)
- [ ] T051 Validate and update manual verification steps in `specs/001-docker-version-management/quickstart.md`

---

## Dependencies & Execution Order

### Stage Dependencies

- **Stage 1**: Must complete first. Hard stop checkpoint after T015.
- **Stage 2**: Begins only after Stage 1 checkpoint.

### Stage 2 Phase Dependencies

- Stage 2 Foundational (Phase 3): blocks all user stories
- User Stories (Phases 4+): depend on Stage 2 Foundational; proceed in priority order P1 -> P2 -> P3
- Polish (Phase 9): depends on all desired user stories

### User Story Dependencies

- **[US1] (P1)**: Depends on Stage 1 + Stage 2 Foundational only
- **[US2] (P1)**: Depends on Stage 1 + Stage 2 Foundational; builds on US1 UI surface (data-loss modal + update action)
- **[US3] (P2)**: Depends on Stage 1 + Stage 2 Foundational; builds on US1 UI surface (activate action)
- **[US4] (P3)**: Depends on Stage 1 + Stage 2 Foundational; builds on US1 state model (local builds + match hints)
- **[US5] (P3)**: Depends on Stage 1 + Stage 2 Foundational; builds on US1 refresh/state UX (offline indicators)

### Parallel Opportunities (Examples)

- **Stage 1 Setup (Phase 1)**:
  - T002, T003, T004, T005, T006 can be developed in parallel once T001 creates the base module skeleton.
- **Stage 2 Foundational (Phase 3)**:
  - T017, T018, T019, T020 can be developed in parallel once T016 establishes the module skeleton + validation helpers.
- **Within User Stories**:
  - Follow `[P]` markers as the default "safe parallel" signal (different files, no hard dependencies).

---

## Parallel Examples (Per User Story)

### Parallel Example: User Story 1 ([US1])

After Stage 2 Foundational completes, these can start in parallel:
- T023 (IPC handlers in `shell/main.js`)
- T024 (preload API in `shell/preload.js`)
- T025 (UI scaffolding in `app/`)

Then, in parallel:
- T027 (install/sync operation core in `shell/service_versions/index.js`)
- T029 (retention policy persistence + IPC in `shell/service_versions/state_store.js` + `shell/main.js` + `shell/preload.js`)
- T030 (delete retained instance core + UI confirmation)

Finally:
- T026 and T028 integrate UI wiring with the implemented IPC surface and operation handlers.

### Parallel Example: User Story 2 ([US2])

These can start in parallel after US1 is working:
- T032 (updateToLatest implementation in `shell/service_versions/index.js`)
- T033 (active container create/start logic in `shell/service_versions/index.js`)

Then:
- T031 (contract updates for cancel/rollback ops) and T034 (IPC wiring) and T035 (data-loss modal) can proceed as soon as the operation shapes are agreed.

### Parallel Example: User Story 3 ([US3])

After US1 is working:
- T038 (activateVersion core in `shell/service_versions/index.js`) can proceed in parallel with UI action-state tweaks in T040.

### Parallel Example: User Story 4 ([US4])

After US1 is working:
- T041 (local build classification + digest match hints in `shell/service_versions/index.js`) can proceed in parallel with UI rendering changes (T042, T043).

### Parallel Example: User Story 5 ([US5])

After US1 is working:
- T044 (offline fallback in `shell/service_versions/releases_client.js`) can proceed in parallel with UI indicators (T045) and message hygiene (T046).

---

## Implementation Strategy

### MVP First (Two-Stage Constraint)

1. Complete Stage 1 (T001-T015) and STOP at the mandatory checkpoint.
2. Complete Stage 2 Foundational (T016-T022).
3. Complete User Story 1 (T023-T030) as the Stage 2 MVP increment.
4. Validate US1 independently per the "Independent Test" criteria in the phase header.

### Incremental Delivery

1. Add User Story 2 (T031-T037) and validate end-to-end update + rollback + cancel.
2. Add User Story 3 (T038-T040) and validate switch flows.
3. Add User Story 4 (T041-T043) and validate local build safety.
4. Add User Story 5 (T044-T046) and validate offline mode.
5. Add Polish (T047-T051) as desired.
