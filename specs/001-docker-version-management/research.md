# Research: Docker Version Management

This document captures the technical decisions for implementing Docker-backed backend service version management in the A0 Launcher Electron app.

## Inputs

- Feature spec: `specs/001-docker-version-management/spec.md` (authoritative for behavior and UX requirements)
- Source docs (original basis): `docs/resources/1_docker-summary.md`, `docs/resources/2_docker-interface-research.md`, `docs/resources/3_docker-impl-guide.md`, `docs/resources/4_corrections_appendices.md`, `docs/resources/docker-versions.md`
- Technical input: `docs/resources/docker-versions.md` (initial research - used as guidance, not as binding decisions)
- Repo constraints: `.specify/memory/constitution.md` (Electron security model, shell/content contract, release semantics)

## Decisions

### D0: Docker Interface Abstraction (Stage 1) + ESM/CJS Strategy

Decision:
- Implement a reusable Docker interface as an ES6 ESM module (for example `shell/docker/DockerInterface.mjs`) that acts as an "abstract" base class.
- Keep the existing Electron shell codebase as CommonJS, and load the ESM Docker interface from CommonJS via dynamic `import()` in async contexts (IPC handlers are already async).
- Provide one default implementation (dockerode-backed) in a separate ESM module (for example `shell/docker/impl/DockerodeDocker.mjs`) loaded on demand by the base class singleton getter.

Rationale:
- Satisfies the requirement that the Docker interface is imported as an ES6 module, without forcing a risky repo-wide module migration.
- Maintains compatibility with current Electron/Forge setup while enabling future specialization by OS/Docker flavor.

Alternatives considered:
- Convert the entire repo to ESM (`"type": "module"`) - rejected as too invasive and risky for this feature.
- Keep everything CommonJS and add an ESM wrapper - rejected because the requirement is for the class itself to be an ES6 module.

Implementation notes (validated against source docs in `docs/resources/`, with errata applied from `docs/resources/4_corrections_appendices.md`):
- Docker Hub registry `tags/list` is paginated via `n`/`last` and RFC5988 `Link: ...; rel="next"`. Use `n=100` explicitly and follow `Link` for continuation.
- Digest checks should rely on the registry `Docker-Content-Digest` response header (not client-computed). Because the digest corresponds to the representation returned, store `(digest, contentType)` together and keep `Accept` ordering stable.
- For Docker Hub, prefer `HEAD /v2/<repo>/manifests/<tag>` for digest/rate-limit headers. Docker documents `GET` can count toward pull usage, while `HEAD` is pull-rate-limit friendly.
- Treat rate-limit headers as implementation-defined. In particular, do not assume `RateLimit-Reset` is an epoch timestamp; treat it as opaque/duration-like and avoid false precision.
- `DOCKER_HOST` parsing: `new URL()` protocols include a trailing colon (for example `unix:` and `npipe:`). Handle `unix:`/`npipe:`/`tcp:` correctly and accept `http:`/`https:` where users provide TCP endpoints that way.
- Pull cancellation: dockerode does not expose a documented server-side cancel. Implement best-effort cancel by keeping the pull stream reference and calling `stream.destroy()`; represent as "aborted (client)" while acknowledging the daemon may continue work.

### D1: Docker Runtime Integration (Local Operations)

Decision:
- Use `dockerode` in the default Docker interface implementation for local Docker operations (list images/containers, pull images, create/start/stop/rename/remove containers, stream pull progress).

Rationale:
- Matches the cross-platform goals (Linux socket, macOS socket, Windows named pipe).
- Reduces bespoke HTTP-over-socket implementation complexity while keeping renderer isolated.
- Aligns with the architecture guidance in `docs/resources/docker-versions.md` (dockerode recommended).

Alternatives considered:
- Native Docker Engine HTTP API over socket/pipe (more control, fewer deps) - rejected for higher implementation complexity and higher bug risk in stream handling and Windows pipes.
- Shelling out to Docker CLI (no API client code) - rejected as brittle (output parsing, PATH dependency, localization, inconsistent progress semantics).

### D2: Official Version Source (Remote Availability)

Decision:
- Use GitHub Releases of `agent0ai/agent-zero` as the curated catalog of semver release versions to display (for example `v1.2.3`).
- Treat each release tag as the intended Docker image tag for `agent0ai/agent-zero:<tag>`, but validate that the tag actually exists in the registry before offering it as installable.
- Treat the Docker Hub tag `testing` as a first-class preview/prerelease version that is NOT derived from GitHub Releases.
- Use targeted Docker Registry v2 manifest lookups (digest retrieval) for a small canonical set of tags:
  - `testing` (preview)
  - `latest` (alias of the most recent release, used for badge/display)
  - release tags from GitHub Releases that are displayed in the UI
- Use Docker Registry v2 tag listing (`tags/list`) to implement the Stage 1 "available tags" method; Stage 2 UI may filter this to canonical tags and semver releases.
- Do not assume a GitHub release implies immediate availability of the corresponding Docker image tag. Install/update/sync operations must verify installability before proceeding with any destructive step.

Rationale:
- GitHub Releases provides a curated, semver-focused catalog that matches the end-user mental model and provides publish time and release metadata.
- Docker Registry is the source of truth for remote tag existence and digests. Using a small set of targeted manifest requests avoids a full "tag soup" UI while still grounding the system in registry reality.
- The project's established prerelease workflow uses the `testing` tag; making it first-class enables non-technical community members to participate without manual Docker operations.

Alternatives considered:
- Docker Registry tag list (Docker Hub v2 API) as the only canonical catalog - rejected because it includes many non-user-facing tags and requires more classification and UI policy to avoid clutter.
- GitHub-only catalog without registry grounding - rejected because it cannot represent `testing` and can present versions that are not yet installable.
- Maintain a custom manifest file - rejected (extra release artifact to manage).

Notes:
- Docker pulls may still hit Docker Hub rate limits. Auth support is handled separately (see D7).
- A version can be discoverable but not yet installable (publish lag). For MVP, verification can be performed at operation start and should fail fast with a user-friendly "not yet available" message.
- Cache installability checks to reduce repeated failures and repeated network work:
  - Cache negative results ("not yet available") for a short TTL and recheck periodically or on user refresh.
  - After first successful verification, treat the version as installable for future operations.

### D3: Tag Classification And Display Rules

Decision:
- Treat official versions as semver-like tags (for example `v1.2.3`), shown in the primary list (only when validated installable).
- Treat `testing` as the canonical preview/prerelease channel, shown as a first-class entry (separate from semver sorting).
- Treat `latest` as an alias of the most recent semver release (show as a badge on that release; do not show `latest` as a separate row).
- Treat canonical local build tags for the backend image as first-class local builds: `local`, `development`, `testing`, `main`.
- Treat other local tags for the same image repo as "Custom Local Build" to avoid clutter.

Rationale:
- End users should not see arbitrary tag soup, but they SHOULD see the project's defined workflows: stable semver releases plus the `testing` preview.
- Canonical local tags enable developer workflows and also enable non-technical users to run known "preview" builds (testing) safely inside the launcher.

Alternatives considered:
- Always show all remote tags from the registry - rejected (clutter and poor UX for non-technical users).
- Fully implement multi-channel digest resolution (stable/edge/nightly/lts) from `docs/resources/docker-versions.md` - deferred; current scope supports the canonical `testing` prerelease tag and `latest` alias only.

### D4: Container Model And Retained Instances (Rollback)

Decision:
- The "active service instance" is a single Docker container with a stable, deterministic name (the "active name").
- On update/switch, the launcher stops the active container and moves it into the retention set by renaming it to a retained name that includes a timestamp (retained-at) and the version label.
- Retained instances are real Docker containers (stopped) kept for rollback and are ordered by retained-at time (not by semver).
- The launcher enforces a user-configured retention limit (default 1) by deleting the oldest retained instances when the limit would be exceeded.

Rationale:
- Matches the spec requirement that the list represents instances (runnable snapshots), not a linear list of versions.
- Gives a concrete rollback mechanism without implementing state migration.
- Provides deterministic cleanup semantics and a UI surface that is transparent (list + delete).

Alternatives considered:
- Keep old instances by leaving container names unchanged and tracking solely in local metadata - rejected (harder to reason about, higher risk of name collisions).
- Use Docker volumes to preserve state across containers - rejected for MVP because the backend mixes code and state; preserving state would block code updates.

### D5: Data Loss Warning And Safety Baseline (MVP)

Decision:
- Treat update/switch as potentially destructive for backend state.
- Before performing update/switch, require an explicit confirmation choice: "I have a backup" or "Proceed without backup" (plus cancel).
- Always keep at least the most recent previous instance available for rollback.

Rationale:
- Avoids silent data loss while keeping MVP implementation feasible.
- Aligns with the feature spec clarifications.

Alternatives considered:
- Automated in-app backup/restore orchestration - explicitly deferred (out of scope in `spec.md`).

### D6: Disk Usage And Free Space Estimate

Decision:
- Phase 1: Show current disk free space for the Docker data root filesystem (if detectable) and show per-instance storage usage when available.
- Phase 2: Add a "free space after update" estimate as an explicitly labeled estimate. When remote size cannot be known reliably, show a conservative warning instead of a precise estimate.

Rationale:
- Disk estimation is useful but easy to get wrong; avoid false precision.
- The feature spec marks this as SHOULD, allowing staged delivery.

Alternatives considered:
- Exact preflight sizing using registry manifests for every candidate version - rejected for complexity and rate-limit risk.

### D7: Credentials And Rate Limiting

Decision:
- Prefer using the user's existing Docker Desktop/Engine credential store (if they are already logged in) without requiring the launcher to manage credentials.
- Do not implement in-app credential entry, UI, or storage for MVP. Registry access is anonymous by default and may use the existing Docker auth context best-effort when present (never logged, never passed to renderer).

Rationale:
- Minimizes credential handling while still providing an escape hatch for rate limits and private images.
- Aligns with constitution Gate A and with `spec.md` FR-020.

Alternatives considered:
- Always require credentials - rejected (worse UX).
- Store credentials in `app/` content - rejected (untrusted content and violates constitution).

### D8: Testing Approach For Logic

Decision:
- Use Node.js built-in `node:test` for pure logic units (tag parsing, semver ordering, retention enforcement decisions, state transitions).
- Keep Docker integration tests manual initially (developer-run) until a CI strategy for Docker is established.

Rationale:
- No repo-standard test runner exists yet; built-in tests add zero external deps.
- High-value logic can still be validated deterministically.

Alternatives considered:
- Add Jest/Vitest - rejected to avoid expanding dependency surface for the first iteration.
