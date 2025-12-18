# Feature Specification: Docker Version Management

**Feature Branch**: `001-docker-version-management`
**Created**: 2025-12-18
**Status**: Draft
**Input**: User description: "Docker Version Management: Based on docs/resources/docker-versions.md, define how the launcher manages versions of its local, container-based backend service."

## Clarifications

### Session 2025-12-18

- Q: What happens to user state on update/switch? -> A: Manual backup gate; keep last previous.
- Q: For MVP update confirmation, what choices are allowed? -> A: Offer "I have a backup" and "Proceed without backup" (plus cancel).
- Q: How are rollback instances retained and removed? -> A: User selects how many to keep (default 1); show retained instances ordered by retained-at date with delete; show storage usage and estimated free space after update.
- Q: How do we support the project's prerelease workflow and canonical local build tags? -> A: Treat `testing` as a first-class preview version from the registry; use GitHub Releases for semver catalog but validate tags against the registry; support canonical local tags (`local`, `development`, `testing`, `main`) and show other local tags as custom local builds.
- Q: Will the launcher prompt for Docker Hub credentials? -> A: No. For MVP, the launcher does not collect/store credentials. If the user's Docker environment is already authenticated, the launcher may use that existing auth context best-effort (main-process only, never exposed to UI or logs).

## Delivery Stages *(mandatory)*

This feature is delivered in **two distinct stages**:

1. **Stage 1 (Prerequisite)**: Implement a reusable Docker interface abstraction (an "abstract" base class + a default implementation). Development stops at this checkpoint.
2. **Stage 2 (Feature)**: Implement Docker Version Management UX using only the Stage 1 abstraction (no direct Docker/registry code in Stage 2 feature logic).

## Stage 1: Docker Interface Base Class *(mandatory prerequisite)*

### Stage 1 Goal

Provide a JavaScript "abstract" superclass that defines a stable Docker/registry interface for the Electron app, plus one default implementation. This interface will be used by Stage 2 and potentially future features/components.

### Stage 1 Design Requirements

The normative requirements for Stage 1 are captured in the **DI-*** requirements below. This section only captures additional design constraints that are not already expressed as DI-* requirements.

- Stage 1 MUST include exactly **one default DockerInterface implementation** (initially dockerode-backed) that works on macOS/Windows/Linux when Docker is available. Helper modules (for example a registry client) are allowed as long as they are not alternate DockerInterface implementations.

### Stage 1 Functional Surface (Abstract Methods)

The abstract class MUST define (and the default implementation MUST implement) the following capabilities:

- **Environment detection**
  - Detect whether Docker is installed/available
  - Detect OS and Docker "flavor" (for future specialization)
- **Remote registry discovery (Docker Hub by default)**
  - List available tags for an image repo (default: `agent0ai/agent-zero`)
  - Retrieve manifest/digest for specific tags (`vX.Y.Z`, `testing`, `latest`)
- **Local image management**
  - List locally downloaded images/tags for the repo
  - Pull/download an image tag with progress
  - Provide a list of currently downloading pulls and progress state
  - Cancel a download **best-effort** (cancellation is not guaranteed by Docker; UI must handle partial/continued daemon work safely)
  - Delete a local image/tag
- **Container management**
  - List containers for the repo (including tag and status)
  - Create a container from parameters, inspect container details (ports/volumes/env), start/stop/restart, delete container

## Stage 2: Docker Version Management *(uses Stage 1)*

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See What Is Running (Priority: P1)

As an end user, I want to quickly see which backend service version is running (or that nothing is running), so I can trust what I am using and confirm that updates took effect.

**Why this priority**: Version visibility prevents confusion and reduces support load ("Am I on the latest version?").

**Independent Test**: Open the "Service Versions" screen and verify the UI correctly shows Active/Installed/Available/Update Available states using a controlled set of version states.

**Acceptance Scenarios**:

1. **Given** the launcher has a backend service version installed and running, **When** I open the "Service Versions" screen, **Then** I see the running version clearly labeled as "Active" and I can read its exact version number.
2. **Given** the launcher has no backend service version installed, **When** I open the "Service Versions" screen, **Then** I see that no version is active and I am offered an obvious first action to install a version.
3. **Given** an installed version is not the newest available official release, **When** I open the "Service Versions" screen, **Then** I see an "Update Available" indicator that includes the newest version number.
4. **Given** the launcher has retained prior service instances for rollback, **When** I open the "Service Versions" screen, **Then** I can see a list of retained instances in retention order (by the date they were retained) including which version each instance ran.
5. **Given** the project publishes a preview version for community testing (`testing`), **When** I open the "Service Versions" screen, **Then** I can see a first-class "Testing" entry and whether it is Installed/Active/Available.

---

### User Story 2 - Update Without Extra Tools (Priority: P1)

As an end user, I want to update to the newest official release with a single action, without using external tools or a command line, so I can stay up to date safely.

**Why this priority**: Smooth updates are the core value of version management for non-technical users.

**Independent Test**: Trigger an update available state and complete an update via one action, verifying progress feedback and that the final active version matches the newest release.

**Acceptance Scenarios**:

1. **Given** an update is available for the installed version, **When** I choose the primary "Update" action, **Then** the launcher shows a data loss warning and requires choosing either "I have a backup" or "Proceed without backup" before the update begins.
2. **Given** an update is in progress, **When** the network fails or the download cannot complete, **Then** I receive a clear error message and the previously installed version remains usable (no broken or partially switched state).
3. **Given** I completed an update successfully, **When** I return to the "Service Versions" screen, **Then** the newest version is shown as "Active" and older versions remain visible as installed (if they were kept).
4. **Given** an update completed but the newly selected version cannot start, **When** I return to the "Service Versions" screen, **Then** I can roll back to the most recent previously active version.

---

### User Story 3 - Install And Switch Versions (Priority: P2)

As an end user, I want to install an older official version and switch to it, so I can recover from issues or match a known working version.

**Why this priority**: Switching versions is the safest escape hatch when a new version misbehaves.

**Independent Test**: With at least two official versions available, install a non-latest version and activate it, verifying the "Active" state updates accordingly.

**Acceptance Scenarios**:

1. **Given** multiple official versions are available, **When** I install a specific version, **Then** it becomes "Installed" and is available to activate.
2. **Given** two versions are installed, **When** I activate a different installed version, **Then** the launcher switches the running backend service to the selected version and the UI reflects the new "Active" version.
3. **Given** the "Testing" preview is available, **When** I install and activate it, **Then** the launcher requires the same data loss warning acknowledgement as any switch and the UI clearly indicates I am running the Testing preview.

---

### User Story 4 - Developer Uses Local Builds Safely (Priority: P3)

As a developer/tester, I want to use a locally built backend version and switch back to the official release, so I can test changes without accidentally confusing a local build with a release.

**Why this priority**: Developer workflows must not contaminate or overwrite stable release behavior.

**Independent Test**: Provide a local build alongside official releases, verify it is clearly separated and labeled, and switching between local and official does not lose the local build.

**Acceptance Scenarios**:

1. **Given** a local build exists on my machine, **When** I open the "Service Versions" screen, **Then** I see local builds in a separate section clearly labeled "Local Build".
2. **Given** I am running a local build, **When** a newer official release exists, **Then** I am not forced to update and I can explicitly choose to keep using the local build.
3. **Given** a local build is identical to an official release, **When** I view version details, **Then** the launcher indicates which official version it matches (without exposing internal identifiers).
4. **Given** a local build uses a canonical tag (`local`, `development`, `testing`, `main`), **When** I open the "Service Versions" screen, **Then** the launcher shows it with a stable label and (when possible) indicates whether it matches or diverges from the corresponding remote tag.

---

### User Story 5 - Works When Offline (Priority: P3)

As an end user, I want to keep using installed versions even when I cannot check for updates, so the launcher remains reliable during outages.

**Why this priority**: The launcher is part of a local workflow and must degrade gracefully.

**Independent Test**: Simulate no network and confirm installed versions remain visible and switchable, while update checks are clearly disabled.

**Acceptance Scenarios**:

1. **Given** I am offline, **When** I open the "Service Versions" screen, **Then** I can still see installed versions and activate among them.
2. **Given** I am offline, **When** I open the "Service Versions" screen, **Then** I see a clear offline indicator and the launcher does not present "Available" versions that require network to install.

---

### Edge Cases

- Missing required runtime or runtime not running: show an actionable, non-technical error and keep installed versions usable (FR-018, FR-019).
- Runtime permission denied: show an actionable error (FR-019) and avoid offering destructive actions until the user resolves it.
- Offline or version sources unreachable: enter offline mode, show installed versions only, and show an offline indicator plus last successful check time (FR-013, FR-014).
- Discoverable version not yet installable (publish lag): show as "Not yet available", suppress a primary install/update action, and allow retry/refresh (FR-029, FR-030, FR-033).
- Registry throttling/rate limits: show a retryable message, preserve the stable state, and avoid repeated checks via caching (FR-018, FR-021; DI-015).
- Insufficient disk space: warn before starting when detectable, and if installation fails, preserve the previously usable version (FR-018, FR-028).
- Canceled installation/update: treat cancel as a client-side abort; UI must remain stable and allow refresh to reconcile daemon state (FR-009; DI-009).
- Selected version cannot start: keep rollback available to the most recent retained instance (FR-024).
- Local build match uncertainty: show as a local build without claiming it matches any official release (FR-035).
- UI content attempts unsupported operations: IPC must validate and reject unsupported requests; renderer must handle errors safely (DI-013; constitution Gate A).

## Requirements *(mandatory)*

### Stage 1 Requirements (Docker Interface Base Class)

- **DI-001**: The project MUST provide an ES6 ESM module for the Docker interface base class (for example `shell/docker/DockerInterface.mjs`) and type it using JSDoc.
- **DI-002**: The base module MUST contain only the "abstract" class; concrete implementations MUST live in separate modules (for example `shell/docker/impl/*`) and be loaded on demand.
- **DI-003**: The base class MUST implement a static method to retrieve Docker + OS environment information (installed/available, platform, and a best-effort "flavor" classification for future overrides).
- **DI-004**: The base class MUST implement a static async getter that selects the correct implementation based on environment info, returns a singleton instance, and caches it for later calls.
- **DI-005**: The default implementation MUST support listing remote tags for a configured image repo (default `agent0ai/agent-zero`) from Docker Hub, including pagination (`n`/`last`) and RFC5988 `Link: ...; rel="next"` continuation handling.
- **DI-006**: The default implementation MUST support retrieving a tag's digest/manifest for specific tags (`vX.Y.Z`, `testing`, `latest`) for validation and match/diff purposes. Digest retrieval SHOULD use the registry `Docker-Content-Digest` response header and SHOULD store `(digest, contentType)` together for determinism.
- **DI-007**: The default implementation MUST support listing local images for the configured repo (tag + digest/id + size + created time).
- **DI-008**: The default implementation MUST support pulling an image tag with progress reporting and a list of in-flight pulls.
- **DI-009**: The default implementation MUST implement best-effort pull cancellation and MUST expose whether cancellation is supported/possible for the current pull. Cancellation MUST be described and treated as client-side abort (it may not stop the daemon from continuing the pull).
- **DI-010**: The default implementation MUST support deleting local images/tags for the configured repo.
- **DI-011**: The default implementation MUST support listing containers for the configured repo (including tag and status).
- **DI-012**: The default implementation MUST support creating/inspecting/starting/stopping/restarting/deleting containers, with container create parameters passed into the method (no hard-coded config in the base class).
- **DI-013**: The Stage 1 Docker interface and its implementations MUST NOT be exposed directly to renderer content; any UI use MUST go through a whitelisted preload surface and validated IPC.
- **DI-014**: The default implementation MUST normalize and return structured error information (code + context) for common failures (daemon unavailable, permission denied, registry unavailable) without leaking secrets.
- **DI-015**: The default implementation MUST classify registry rate-limit responses and preserve relevant response headers for backoff decisions. It MUST avoid false precision (for example, treat reset values as opaque unless clearly specified).

### Stage 2 Requirements (Docker Version Management)

### Functional Requirements

- **FR-001**: The launcher MUST provide a user-visible screen for managing backend service versions ("Service Versions").
- **FR-002**: The launcher MUST show the currently running backend service version, or clearly indicate when no version is active.
- **FR-003**: The launcher MUST indicate which versions are installed locally.
- **FR-004**: The launcher MUST indicate when a newer official release is available compared to the locally installed version.
- **FR-005**: The launcher MUST allow installing a selected official version with a single user action.
- **FR-006**: The launcher MUST allow activating a selected installed version with a single user action.
- **FR-007**: The launcher MUST provide a single primary "Update" action when an update is available.
- **FR-008**: The launcher MUST show installation and update progress while a version is being installed or updated.
- **FR-009**: The launcher MUST allow canceling an in-progress installation/update and return to a stable state.
- **FR-010**: The launcher MUST separate official releases from local builds in the UI (distinct sections or clearly distinct labeling).
- **FR-011**: The launcher MUST clearly indicate when the active version is a local build.
- **FR-012**: The launcher MUST allow developers/testers to keep using local builds even when a newer official release exists.
- **FR-013**: The launcher MUST support offline operation by showing installed versions and allowing activation among installed versions without requiring network access.
- **FR-014**: When the launcher cannot check for updates, it MUST clearly communicate that update checks are unavailable and (when known) show when it last checked successfully.
- **FR-015**: The primary UI MUST avoid container-implementation terminology (for example: "Docker", "image", "tag", "digest", "registry", "socket", "daemon"). If troubleshooting guidance requires technical terms, it MUST be isolated to an explicit help/troubleshooting surface.
- **FR-016**: The launcher MUST resolve friendly labels like "Latest Release" to an exact version number and display the exact version that will run before the user installs or activates it.
- **FR-017**: The launcher MUST provide a manual "Refresh" action to re-check available versions when the user requests it.
- **FR-018**: The launcher MUST prevent partial or failed install/update attempts from leaving the user without a usable installed version (fail-safe behavior).
- **FR-019**: If the required local runtime is unavailable or access is denied, the launcher MUST show an actionable error message with next steps (without requiring users to run commands).
- **FR-020**: If user credentials are supported for accessing official releases (not in MVP), the launcher MUST store them securely (shell-only, using Electron `safeStorage`) and MUST NOT expose them to the UI content or logs.
- **FR-021**: The launcher SHOULD reduce unnecessary update checks by reusing recent version information for at least 24 hours by default unless the user explicitly refreshes.
- **FR-022**: The launcher MUST support browsing and selecting older official versions (not only the newest release) for installation.
- **FR-023**: Before performing an update or switch that may result in loss of application state, the launcher MUST show an explicit data loss warning and require the user to choose one of: "I have a backup" or "Proceed without backup" before proceeding.
- **FR-024**: The launcher MUST keep the most recent previously active version available for rollback after an update.
- **FR-025**: The launcher MUST allow the user to configure how many previous service instances to retain for rollback, with a default of 1.
- **FR-026**: The launcher MUST show a user-visible list of retained service instances (not just versions), ordered by when the instance was retained, and include the version label for each retained instance.
- **FR-027**: The launcher MUST allow deleting retained (non-active) instances individually via a clear "Delete" action and MUST require confirmation before deletion.
- **FR-028**: The launcher SHOULD show storage usage for installed/retained instances and available disk space. When starting an update, it SHOULD display an estimate of remaining free space after the update completes, factoring the retention limit and the new installation.
- **FR-029**: Before starting an install/update for an official version, the launcher MUST verify that the target version is actually installable (and if it is not, it MUST show a clear retryable message and leave the currently usable version unchanged).
- **FR-030**: If the launcher knows a discoverable official version is not yet installable, it SHOULD avoid presenting a primary install/update action for that version until it becomes installable (or the user explicitly retries).
- **FR-031**: The launcher SHOULD cache installability check results (including "not yet available") and re-check periodically (or on explicit user refresh). After a version is successfully verified as installable, the launcher MAY treat it as installable for future operations.
- **FR-032**: The launcher MUST support the canonical prerelease tag `testing` as a first-class preview version, even when it is not represented by GitHub Releases.
- **FR-033**: For semver release versions discovered from GitHub Releases, the launcher MUST validate that the corresponding remote tag exists in the configured registry before offering it as installable. If it does not exist yet, the launcher MUST show it as "Not yet available" (or equivalent non-technical wording).
- **FR-034**: The launcher MUST recognize canonical local build tags for the backend image (`local`, `development`, `testing`, `main`) and present them with stable labels. Other local tags for the same image repo SHOULD be shown as "Custom Local Build".
- **FR-035**: The launcher SHOULD use digest comparison (when available) to determine when a local image matches a canonical remote variant (`vX.Y.Z`, `testing`, and `latest`) and present a human-readable match hint without exposing internal identifiers.
- **FR-036**: When a canonical local tag (for example local `testing`) diverges from its remote counterpart, the launcher SHOULD surface an explicit "Update/Synchronize" action to align it with the remote tag.
- **FR-037**: Stage 2 feature logic MUST use the Stage 1 Docker interface abstraction for all Docker/registry interactions and MUST NOT implement Docker Engine or registry protocol logic directly.

### Scope And Boundaries

- In scope (Stage 1):
  - Docker interface abstraction (ESM base class + one default implementation)
  - Docker + OS environment detection and implementation selection
  - Docker Hub remote tag listing + manifest digest checks for canonical tags
  - Local image listing, pull with progress, best-effort cancel, image deletion
  - Container listing and full lifecycle operations (create/inspect/start/stop/restart/delete)
- In scope (Stage 2):
  - Listing versions (semver from GitHub Releases validated via registry) + first-class `testing`
  - Showing installed vs available; showing active version; install/update/switch/sync actions
  - Explicit data loss warning and confirmation; retained instances for rollback with user-configurable retention (default 1); per-instance delete
  - Offline mode (installed-only) and local build visibility (canonical tags + custom local builds)
  - Clear, non-technical UI language; progress and cancellation; safe failure behavior
- Out of scope:
  - Building local versions inside the launcher (still supported as pre-existing local images, not built by the launcher)
  - Advanced runtime configuration (resource limits, custom networking)
  - Managing multiple simultaneous backend instances
  - Managing non-official third-party sources
  - Automated backup/restore orchestration (deferred enhancement)

### Assumptions And Dependencies

- The backend service is distributed as a versioned artifact that can be installed and started locally by the launcher (currently container-based).
- A compatible local runtime is required for install/activate/update flows.
- The launcher has a configured source of official releases that can be queried when online.
- For MVP, the launcher does not prompt for or store registry credentials. Authenticated registry access is best-effort via the user's existing Docker environment configuration, and credentials must never be exposed to UI content or logs.
- "Launcher app version" and "UI content version" are separate from the "backend service version" managed by this feature.

### Key Entities *(include if feature involves data)*

- **Service Version**: A selectable backend service release or local build, identified by an exact version label and categorized as official release or local build.
- **Service Instance**: A locally stored runnable instance of a specific Service Version, including retained instances kept for rollback and identified by when it was retained.
- **Version State**: The current status of a Service Version for the user: Available, Installed, Active, Update Available, Installing (in progress), or Error.
- **Install/Update Operation**: A user-visible operation with status (in progress, complete, canceled, failed) and progress information.
- **Credentials (optional)**: User-provided access details for retrieving official releases, stored securely and never displayed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of users can identify the currently running backend service version (or that none is running) within 10 seconds of opening the "Service Versions" screen.
- **SC-002**: At least 95% of users can update to the newest official release in 2 clicks or fewer from the "Service Versions" screen.
- **SC-003**: At least 99% of failed install/update attempts leave the previously installed version usable (no unrecoverable or ambiguous state).
- **SC-004**: Reduce support requests related to "which version am I running?" and "how do I update?" by at least 50% within 60 days after release of this feature.
