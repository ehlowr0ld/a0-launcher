# Implementation Plan: Docker Version Management

**Branch**: `001-docker-version-management` | **Date**: 2025-12-18 | **Spec**: `specs/001-docker-version-management/spec.md`
**Input**: Feature specification from `specs/001-docker-version-management/spec.md` (authoritative behavior); original source material in `docs/resources/` (reference)

## Summary

This plan delivers the feature in **two distinct stages**:

- **Stage 1 (Prerequisite)**: Implement a reusable Docker interface abstraction (ESM "abstract" base class + one default implementation) that provides Docker daemon operations and Docker Hub registry operations (tags/digests) for `agent0ai/agent-zero` by default. Development stops at this checkpoint.
- **Stage 2 (Feature)**: Implement the "Service Versions" UI and version-management logic using only the Stage 1 abstraction (no direct Docker/registry protocol logic in Stage 2).

Key technical approach:
- Main process owns all Docker and network interactions.
- Renderer calls a small, whitelisted `contextBridge` API to perform actions and receive progress/state updates.
- Stage 1 provides a Docker interface abstraction as an **ESM module** (loaded from CommonJS via `import()`), with environment detection and singleton selection of implementation.
- Semver release versions are sourced from GitHub Releases (Stage 2), and validated against the registry via the Docker interface before being offered as installable.
- The canonical prerelease/preview channel `testing` is sourced directly from the registry via the Docker interface and shown as a first-class entry.
- Rollback uses retained stopped containers (instances) with a user-configurable retention count (default 1).

## Technical Context

**Language/Version**: JavaScript (CommonJS), Node.js 20+, Electron 33.x (Electron Forge)
**Primary Dependencies (existing)**: Electron, Electron Forge
**Primary Dependencies (planned)**:
- `dockerode` (Docker daemon client, cross-platform socket/pipe handling)
- `semver` (semver parsing/sorting for official versions)
Justification (constitution IV):
- `dockerode`: Node/Electron built-ins do not provide a cross-platform Docker Engine client with correct stream/progress handling and Windows named pipe support; dockerode is the smallest practical dependency to reduce bespoke socket/pipe HTTP implementation risk.
- `semver`: Node does not include a semver parser/sorter; a dedicated semver library avoids hand-rolled parsing bugs and keeps release ordering deterministic.
**Storage**: Local filesystem (Electron `userData`) for caches and retention metadata; Docker for images/containers; optional secure blob via Electron `safeStorage`
**Auth/Credentials (MVP)**: No in-app credential UI or storage. Registry auth is best-effort via the user's existing Docker environment configuration (main process only). Never log or return credential material to the renderer.
**Testing**: Optional. If/when we add pure-logic unit tests, use Node.js built-in `node:test` (no third-party runner).
**Target Platform**: Desktop (macOS, Windows, Linux)
**Project Type**: Electron desktop app (packaged shell + downloadable content)
**Constraints**:
- Strict Electron isolation: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- Downloaded `app/` content is untrusted
- Docker socket/pipe access is privileged and must remain main-process only
- Primary UI must avoid container terminology (see spec FR-015)

## Constitution Check

*GATE: Must pass before implementation. Re-check after design changes.*

- Gate A (Security): PASS (planned)
  - All Docker operations remain in `shell/` (main process).
  - Renderer receives a whitelisted API via `shell/preload.js` (no raw `ipcRenderer`, no socket access).
  - IPC inputs are validated: only allow actions for an allowlisted image repo and known version tags.
  - Credentials are never exposed to renderer or logs. MVP does not add credential UI/storage; auth (if any) is via existing Docker environment configuration only.
- Gate B (Bundle Contract): PASS (planned)
  - `app/` content remains UTF-8 text-only (HTML/CSS/JS). No new binary assets required for this feature.
  - `content.json` schema remains unchanged.
- Gate C (Release Semantics): PASS (planned, requires MAJOR bump)
  - This feature adds new main-process behavior and new preload IPC surface. Release tags must treat this as a MAJOR change.

## Project Structure

### Documentation (this feature)

```text
specs/001-docker-version-management/
├── spec.md                     # Feature specification (authoritative)
├── plan.md                     # This file
├── research.md                 # Phase 0 output (decisions + alternatives)
├── data-model.md               # Phase 1 output (entities + transitions)
├── quickstart.md               # Phase 1 output (dev/test guide)
├── contracts/
│   └── ipc.openapi.yaml        # Phase 1 output (IPC contract modeled as API)
├── checklists/
│   └── requirements.md         # Spec quality checklist
└── tasks.md                    # Phase 2 output (created by /speckit.tasks)
```

### Source Material (reference)

These documents were the original basis for the spec and contain deeper research and implementation guidance:
- `docs/resources/1_docker-summary.md`
- `docs/resources/2_docker-interface-research.md`
- `docs/resources/3_docker-impl-guide.md`
- `docs/resources/4_corrections_appendices.md`
- `docs/resources/docker-versions.md`

Note: `specs/001-docker-version-management/spec.md` and this plan are authoritative for what we implement. The source docs are reference material and may contain out-of-scope ideas.

### Source Code (repository root)

```text
app/                            # Downloaded content source (UI)
  index.html                    # Will become the "Service Versions" UI entry point (or router)
shell/                          # Packaged Electron shell
  main.js                       # Add IPC handlers; delegate to service version manager
  preload.js                    # Expose whitelisted service versions API
  docker/                        # Stage 1: Docker interface abstraction (ESM)
    DockerInterface.mjs          # Abstract base class + singleton selector
    impl/                        # Concrete implementations (loaded on demand)
      DockerodeDocker.mjs        # Default implementation (dockerode + registry client)
      DockerHubRegistry.mjs      # Docker Hub registry client (token + tags/list + manifest digest)
  service_versions/              # Stage 2: Feature module (main process) - uses shell/docker/* only
    index.js                    # Public API used by main.js IPC handlers (uses DockerInterface)
    releases_client.js          # GitHub Releases client + caching
    state_store.js              # userData persistence (retention policy + metadata)
    retention.js                # naming, ordering, cleanup decisions
    errors.js                   # structured error mapping for UI messaging
```

## Design Overview

### External Integrations

- Docker runtime: Docker Desktop/Engine via local socket/pipe (main process only)
- Release metadata: GitHub Releases for `agent0ai/agent-zero` (cached, TTL-based) (Stage 2)
- Image source: Docker image repo `agent0ai/agent-zero` (pulled by tag) (Stage 1)
- Registry discovery/validation: Docker Registry v2 (Docker Hub) for tag list and digest checks (Stage 1, targeted to canonical tags and release tags shown in UI)

### UI Contract (Non-Technical)

The UI uses user-facing language:
- "Service Versions", "Installed", "Available", "Update Available", "Active", "Local Build"
- No Docker terms in primary UI content

### Core Flows

#### Refresh State

1. Get Docker interface singleton: `await DockerInterface.get()` (Stage 1).
2. Fetch cached state (userData) and local Docker state (containers/images) via Docker interface.
3. Fetch GitHub release metadata if TTL expired (default: 24 hours) or user clicked Refresh.
4. Fetch registry tag/digest state via Docker interface:
   - Always include `testing` (preview)
   - Always include `latest` (alias badge)
   - Include semver release tags that are displayed (installability + digest when possible)
5. Reconcile into a single `ServiceVersionsState`:
   - official releases (sorted by semver)
   - preview/testing (first-class entry)
   - local builds (separate section)
   - active version
   - retained instances (sorted by retained-at timestamp)

#### Install Version

1. Validate tag belongs to an official release (or is explicitly allowed).
2. Verify the target version is installable via Docker interface registry manifest existence/digest before starting the pull (handle publish lag with a clear retryable message).
3. Cache installability check results (default: cache "not yet available" for 15 minutes; cache "installable" for 24 hours; manual refresh forces re-check).
4. Pull/sync the image via Docker interface with progress events (best-effort cancel supported).
5. Update local state and refresh UI.

#### Activate Version / Update To Latest (MVP Safety Baseline)

1. UI requires explicit data-loss acknowledgement (spec FR-023).
2. Verify the target version is installable via Docker interface registry manifest existence/digest before starting the pull (do not stop/retain current until installability is confirmed).
3. Cache installability check results (default: cache "not yet available" for 15 minutes; cache "installable" for 24 hours; manual refresh forces re-check).
4. Pull image if needed (progress events) via Docker interface.
5. Stop active container.
6. Move active container into retention set (rename + record retained-at).
7. Create and start a new active container for the selected version.
8. Enforce retention limit by deleting oldest retained instances beyond `keepCount`.

Fail-safe requirements:
- If pull fails, do not stop or rename active container.
- If new container fails to start, rollback remains available (spec FR-024).

#### Retention Management

- A user-configurable retention count (default 1) controls automatic cleanup.
- The UI shows a list of retained instances (instances, not a linear version history), ordered by retained-at time.
- Per-instance delete is available for non-active instances with confirmation.

### Storage Usage / Disk Free

Implement as staged behavior:
- Show best-effort current disk free for the Docker root filesystem (if detectable).
- Add an explicitly labeled estimate for free space after update when inputs are reliable; otherwise show a warning instead of false precision.

### Security Notes (Docker Socket Is Privileged)

- Do not allow arbitrary image references or arbitrary commands from renderer.
- Allowlist the backend image repo and validate tags against the official release list.
- MVP: Do not implement in-app credentials. If the user's Docker environment is already authenticated, use that auth context best-effort. If a future credential feature is added, it must be shell-only, stored via Electron `safeStorage`, and never exposed to renderer or logs.

## Phase Outputs (for SpecKit)

- Phase 0 (Research): `specs/001-docker-version-management/research.md`
- Phase 1 (Design + Contracts):
  - `specs/001-docker-version-management/data-model.md`
  - `specs/001-docker-version-management/contracts/ipc.openapi.yaml`
  - `specs/001-docker-version-management/quickstart.md`
- Phase 2 (Implementation Planning): `specs/001-docker-version-management/tasks.md` (created by `/speckit.tasks`)

## Verification Plan

- Optional: Unit logic tests: `node --test` (for semver ordering, retention decisions, and state transitions)
- Dev run: `npm start`
- Manual integration checks:
  - With Docker running: install version, activate version, update to latest, rollback to retained
  - With Docker stopped: verify actionable error UX (no commands required for end users)
  - Offline mode: remote release fetch fails, installed versions remain visible
  - UX checks (no telemetry in MVP): timebox "identify active version" and "start update" flows to validate SC-001/SC-002 expectations in manual testing
