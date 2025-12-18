# Data Model: Docker Version Management

This document defines the data entities and state transitions required by `specs/001-docker-version-management/spec.md`.

## Storage Locations (Planned)

All persistent state for this feature lives under the Electron `userData` directory, separate from downloaded `app/` content.

Suggested layout (paths are relative to Electron `app.getPath('userData')`):

- `service_versions/state.json`: user settings and retention metadata
- `service_versions/cache/releases.json`: cached GitHub release list (TTL-based)
- `service_versions/cache/installability.json`: cached installability checks for official versions and canonical channel tags (positive/negative with freshness + optional digest)
- `service_versions/cache/registry.json`: cached registry digests for canonical remote tags (vX.Y.Z, `testing`, `latest`) used for match/divergence hints
- `service_versions/cache/daemon.json`: cached Docker daemon info (best-effort)
- `service_versions/cache/storage.json`: cached storage/df snapshot (best-effort)
- `service_versions/credentials.json`: encrypted blob written by shell using Electron `safeStorage` (not in MVP; reserved for a future credential feature if added)

## Core Entities

### 0) DockerEnvironmentInfo

Represents detected local environment and Docker availability (Stage 1 interface).

Fields:
- `platform`: string (Node `process.platform`, for example `darwin`, `win32`, `linux`)
- `arch`: string (Node `process.arch`)
- `dockerAvailable`: boolean
- `dockerFlavor`: enum: `docker_desktop` | `docker_engine` | `unknown`
- `daemonVersion`: string | null
- `diagnosticCode`: string | null (for example `DAEMON_UNAVAILABLE`, `PERMISSION_DENIED`)

### 1) OfficialRelease

Represents an official backend version available for install, sourced from GitHub Releases.

Fields:
- `tag`: string (for example `v1.2.3`)
- `publishedAt`: ISO-8601 string
- `isPrerelease`: boolean
- `releaseUrl`: string (GitHub release URL)
- `notesUrl`: string (optional)

Validation:
- `tag` MUST match the backend image tag format used by official releases (semver-like; allow a leading `v`).

### 2) LocalImage

Represents a locally available Docker image for the backend.

Fields:
- `imageRef`: string (repository + tag, for example `agent0ai/agent-zero:v1.2.3`)
- `tag`: string (the tag part only)
- `imageId`: string (Docker image id/digest-like identifier)
- `sizeBytes`: number
- `createdAt`: unix timestamp (ms)
- `source`: enum: `pulled` | `local_build` | `unknown`
- `tagKind`: enum: `canonical_local` | `custom_local` | `canonical_remote` | `unknown`

Notes:
- `source` is derived. A simple heuristic: if `tag` exists in `OfficialRelease`, treat as `pulled`; otherwise `local_build` (developer-facing section).

### 3) ServiceVersion (User-Facing)

Represents a selectable version shown in the UI, combining remote + local state.

Fields:
- `id`: string (stable id, typically the release tag)
- `displayVersion`: string (for example `1.2.3` or `v1.2.3` depending on UI rules)
- `channelBadges`: string[] (for example `["latest"]` or `["testing"]`)
- `category`: enum: `official_release` | `local_build`
- `availability`: enum: `available` | `installed` | `update_available` | `installing` | `error`
- `installability`: enum: `unknown` | `installable` | `not_yet_available` | null
- `matchHint`: string | null (human-readable, no internal identifiers)
- `isActive`: boolean
- `publishedAt`: ISO-8601 string | null
- `sizeBytes`: number | null (if known)

Derived fields:
- `availability` derives from `OfficialRelease` presence, local image presence, and the current active container.
- `update_available` is true when there is a newer `OfficialRelease` than the currently active/installed official release.

Validation:
- Primary UI MUST not use Docker terminology. The `displayVersion` should be user-friendly and stable.

### 3.1) RemoteTagInfo

Represents a remote tag for the configured image repo in the registry (Stage 1 interface).

Fields:
- `tag`: string (for example `v1.2.3`, `latest`, `testing`)
- `digest`: string | null (sha256:..., when known)
- `contentType`: string | null (media type of the manifest representation used for digest)
- `installability`: enum: `unknown` | `installable` | `not_yet_available`
- `checkedAt`: ISO-8601 string

### 4) ServiceInstance (Retained Container Snapshot)

Represents a runnable retained instance used for rollback. This is a real Docker container stored locally.

Fields:
- `containerId`: string
- `containerName`: string (sanitized; unique)
- `versionTag`: string (the version the instance ran)
- `retainedAt`: ISO-8601 string
- `createdAt`: unix timestamp (ms) (from Docker inspect, if available)
- `status`: enum: `retained` | `active` | `deleted`
- `sizeBytes`: number | null (if available)

Ordering:
- The retention list is ordered by `retainedAt` descending (most recently retained first), regardless of semver.

### 5) RetentionPolicy

Fields:
- `keepCount`: number (integer, default 1, min 0, max 20) (max matches `contracts/ipc.openapi.yaml`)

Rules:
- The launcher MUST prevent deleting the active instance.
- The launcher MUST retain at least the most recent previous active instance after an update (spec FR-024). This is compatible with `keepCount=1` default.

### 6) InstallOrUpdateOperation

Represents a long-running operation that must surface progress and be cancelable.

Fields:
- `opId`: string
- `type`: enum: `install` | `update` | `activate` | `delete_instance`
- `status`: enum: `queued` | `running` | `canceled` | `failed` | `completed`
- `startedAt`: ISO-8601 string
- `finishedAt`: ISO-8601 string | null
- `targetVersionTag`: string | null
- `progress`: number (0-100) | null
- `message`: string | null
- `error`: string | null

Constraints:
- Only one install/update operation should run at a time for the backend service to avoid conflicting container lifecycle changes.

### 7) InstallabilityCacheEntry

Represents the most recent knowledge about whether an official version (including canonical channel tags like `testing`) is installable.

Fields:
- `tag`: string
- `status`: enum: `unknown` | `installable` | `not_yet_available`
- `checkedAt`: ISO-8601 string
- `recheckAfter`: ISO-8601 string | null (for negative cache freshness)
- `digest`: string | null (when known; used to determine digest matches against local images and other canonical tags)
- `contentType`: string | null (when known; store with digest to keep comparisons deterministic)

## State Aggregates

### VersionManagerState (Internal Shell State)

Fields:
- `activeVersionTag`: string | null
- `officialReleases`: `OfficialRelease[]` (cached)
- `installabilityCache`: `InstallabilityCacheEntry[]` (cached; used to avoid repeated failures and to disable primary actions when known unavailable)
- `remoteTagDigests`: map of `{ tag: { digest, contentType } }` for canonical remote tags (cached; used for "matches release/testing" hints and divergence detection)
- `localImages`: `LocalImage[]`
- `retainedInstances`: `ServiceInstance[]`
- `retentionPolicy`: `RetentionPolicy`
- `offline`: boolean (true when remote release source is unavailable)
- `lastSyncedAt`: ISO-8601 string | null
- `lastError`: string | null

### UI View State (Renderer)

Fields:
- `versions`: `ServiceVersion[]` grouped by `category` and sorted by semver (official) or recency (local builds)
- `retainedInstances`: `ServiceInstance[]` sorted by `retainedAt` desc
- `operation`: `InstallOrUpdateOperation | null`
- `storage`: optional object:
  - `dockerRootDir`: string | null
  - `freeBytes`: number | null
  - `usedBytes`: number | null
  - `estimateAfterUpdateBytes`: number | null (explicitly labeled estimate)

## State Transitions (High-Level)

### Update Flow (MVP Safety Baseline)

1. Preflight computes update target version and validates runtime availability.
2. UI shows data loss warning and requires explicit user choice (backup vs proceed).
3. Pull image for target version (progress updates).
4. Stop active container (if any).
5. Rename active container into retention set (retainedAt timestamp recorded).
6. Create and start new active container for the selected version.
7. Enforce retention policy by deleting oldest retained containers beyond `keepCount`.
8. Refresh state and notify UI.

Failure guarantees:
- If image pull fails, do not stop or rename the active container.
- If starting the new container fails after retention, rollback is available by starting the most recent retained instance.
