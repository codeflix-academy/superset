# Portal Transcript Ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop client actually ship Claude Code / Codex transcripts to the venture studio portal — replacing the current stub payloads — and switch to the canonical `/api/sessions/ingest` endpoint with full schema fields. Add a manual file-picker upload path as a deterministic fallback.

**Architecture:** Add a small `transcript-discovery` utility in the main process that (a) encodes a workspace cwd to Claude Code's `~/.claude/projects/<encoded>/` directory and (b) globs both Claude Code and Codex JSONL paths, returning the most-recently-modified file within a freshness window. Expose two new tRPC procedures on `portal.sessions` (`captureAndIngest`, `uploadFromFilePicker`) that do the read+post entirely in the main process so transcripts never round-trip across IPC. Update both renderer call sites (auto-capture hook + manual upload button).

**Tech Stack:** Electron main process (Node), trpc-electron, bun test, zod, native `node:fs`/`node:path`/`node:os`, Electron `dialog.showOpenDialog`.

---

## Background — what is broken today

- `apps/desktop/src/renderer/hooks/useStudioSessionCapture.ts:23-29` and `apps/desktop/src/renderer/routes/_authenticated/_dashboard/sessions/components/UploadSessionButton/UploadSessionButton.tsx:32-35` both send `transcript: JSON.stringify({type:"manual"|"terminal-exit", timestamp})`.
- The portal endpoint (`/api/sessions/ingest`, formerly `/api/coding-sessions/ingest`) parses the body as JSONL/multi-line JSON Claude Code or Codex transcript and rejects with `400 "No prompts found in transcript"`.
- The desktop posts to `/api/coding-sessions/ingest` which is now a backward-compat rewrite stub that will eventually be removed.

## Critical facts (verified during investigation)

| Fact | Source |
|---|---|
| Terminal-exit notification carries `paneId, exitCode, signal?, reason?` | `apps/desktop/src/lib/trpc/routers/notifications.ts:10-25` |
| `Pane.cwd` is tracked on the pane state (OSC-7 confirmed) | `apps/desktop/src/shared/tabs-types.ts:152` |
| Pane state lives in `appState.data.tabsState.panes[paneId]` | `apps/desktop/src/main/lib/app-state/schemas.ts:24,32` |
| Claude Code transcript path: `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` | Verified on disk |
| Encoding rule: replace BOTH `/` AND `.` with `-` | Verified on disk: `/Users/jesseluo/.superset/worktrees/x` → `-Users-jesseluo--superset-worktrees-x` |
| Codex transcript path: `${TMPDIR:-/tmp}/superset-codex-session-$$_${ts}.jsonl` (ephemeral, not tracked main-side) | `apps/desktop/src/main/lib/agent-setup/templates/codex-wrapper-exec.template.sh:8` |
| File-read pattern in main: `readFileSync(path, "utf-8")` inside a tRPC procedure | `apps/desktop/src/lib/trpc/routers/config/config.ts:411-435` |
| File-picker pattern: `dialog.showOpenDialog(getWindow(), { ... })` | `apps/desktop/src/lib/trpc/routers/window.ts:99-127` |
| Type-check command | `pnpm -F @superset/desktop typecheck` |
| Test command | `pnpm -F @superset/desktop test` (bun test) |
| Portal accepts `{ projectId, transcript, branchName?, source?, sessionStartedAt?, sessionEndedAt?, prUrl?, prNumber? }` and 5MB payload max | `venture-studio-portal/src/app/api/sessions/ingest/route.ts:899-913,855` |
| Portal auth: `Authorization: Bearer <supabaseAccessToken>` (already wired) | `apps/desktop/src/lib/trpc/routers/portal/index.ts:7-16` |

## Out of scope

- **Per-session deterministic ID tracking.** No reliable way to bind a Claude Code `sessionId` to a tab today. We use the "most-recently-modified .jsonl in encoded cwd dir, modified within `freshnessWindowMs`" heuristic. This is good enough for MVP and documented in the code.
- **Capturing `CODEX_TUI_SESSION_LOG_PATH` per-pane.** Wrapper script changes are out of scope; we glob `${TMPDIR}/superset-codex-session-*.jsonl` instead.
- **Removing the old `/api/coding-sessions/ingest` rewrite stub on the portal side.** Portal-side cleanup is a separate concern.

## File structure

| File | Action | Purpose |
|---|---|---|
| `apps/desktop/src/main/lib/transcript-discovery/index.ts` | **Create** | Pure helpers: `encodeClaudeProjectsDir`, `findMostRecentJsonl`, `findRecentTranscript` (orchestrates Claude Code + Codex). Plus `readTranscriptFile` (reads a path, validates size, returns content). |
| `apps/desktop/src/main/lib/transcript-discovery/index.test.ts` | **Create** | bun test coverage for the encoder + discovery using a temp dir. |
| `apps/desktop/src/lib/trpc/routers/portal/index.ts` | **Modify** | Switch URL to `/api/sessions/ingest`, extend `sessions.ingest` input schema, add `sessions.captureAndIngest` and `sessions.uploadFromFilePicker`. |
| `apps/desktop/src/renderer/hooks/useStudioSessionCapture.ts` | **Modify** | Pass `paneId` from terminal-exit event, call `captureAndIngest`. |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/sessions/components/UploadSessionButton/UploadSessionButton.tsx` | **Modify** | Call `uploadFromFilePicker`, drop the stub payload. |

---

## Task 1: transcript-discovery utility (TDD)

**Files:**
- Create: `apps/desktop/src/main/lib/transcript-discovery/index.ts`
- Test: `apps/desktop/src/main/lib/transcript-discovery/index.test.ts`

- [ ] **Step 1.1: Write the failing test for `encodeClaudeProjectsDir`**

```ts
// apps/desktop/src/main/lib/transcript-discovery/index.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, utimesSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	encodeClaudeProjectsDir,
	findMostRecentJsonl,
	findRecentTranscript,
} from "./index";

describe("encodeClaudeProjectsDir", () => {
	test("encodes a plain Unix path by replacing / with -", () => {
		expect(encodeClaudeProjectsDir("/Users/jesseluo")).toBe("-Users-jesseluo");
	});

	test("encodes dots in path segments to -", () => {
		expect(
			encodeClaudeProjectsDir("/Users/jesseluo/.superset/worktrees/x"),
		).toBe("-Users-jesseluo--superset-worktrees-x");
	});

	test("preserves existing dashes in segment names", () => {
		expect(
			encodeClaudeProjectsDir("/Users/me/Documents/workspaces/venture-studio-portal"),
		).toBe("-Users-me-Documents-workspaces-venture-studio-portal");
	});

	test("handles trailing slash", () => {
		expect(encodeClaudeProjectsDir("/Users/me/")).toBe("-Users-me-");
	});
});
```

- [ ] **Step 1.2: Run the test and verify it fails with module-not-found**

Run: `cd /Users/jesseluo/Documents/workspaces/superset && pnpm -F @superset/desktop test src/main/lib/transcript-discovery/index.test.ts`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 1.3: Create the minimal `index.ts` with `encodeClaudeProjectsDir`**

```ts
// apps/desktop/src/main/lib/transcript-discovery/index.ts
/**
 * Encodes a working directory path into Claude Code's `~/.claude/projects/` subdirectory name.
 * Claude Code replaces both `/` and `.` characters with `-`.
 *
 * Examples:
 *   /Users/me                          → -Users-me
 *   /Users/me/.config/foo              → -Users-me--config-foo
 *   /Users/me/Documents/venture-studio → -Users-me-Documents-venture-studio
 */
export function encodeClaudeProjectsDir(cwd: string): string {
	return cwd.replace(/[/.]/g, "-");
}
```

- [ ] **Step 1.4: Run encoder tests, verify pass**

Run: `pnpm -F @superset/desktop test src/main/lib/transcript-discovery/index.test.ts`
Expected: 4 tests pass for `encodeClaudeProjectsDir`. The other describe blocks will fail because their imports don't exist yet — that's expected.

- [ ] **Step 1.5: Add failing test for `findMostRecentJsonl`**

Append to `index.test.ts`:

```ts
describe("findMostRecentJsonl", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "transcript-discovery-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("returns null when directory does not exist", () => {
		expect(findMostRecentJsonl("/nonexistent/path", { maxAgeMs: 60_000 })).toBeNull();
	});

	test("returns null when directory has no .jsonl files", () => {
		writeFileSync(join(tempDir, "not-a-transcript.txt"), "x");
		expect(findMostRecentJsonl(tempDir, { maxAgeMs: 60_000 })).toBeNull();
	});

	test("returns the most recently modified .jsonl file", () => {
		const older = join(tempDir, "older.jsonl");
		const newer = join(tempDir, "newer.jsonl");
		writeFileSync(older, "{}");
		writeFileSync(newer, "{}");
		// Force older to be 5s in the past
		const past = new Date(Date.now() - 5_000);
		utimesSync(older, past, past);

		const result = findMostRecentJsonl(tempDir, { maxAgeMs: 60_000 });
		expect(result?.path).toBe(newer);
	});

	test("respects maxAgeMs and returns null when nothing is fresh enough", () => {
		const old = join(tempDir, "old.jsonl");
		writeFileSync(old, "{}");
		const past = new Date(Date.now() - 120_000); // 2 minutes old
		utimesSync(old, past, past);

		expect(findMostRecentJsonl(tempDir, { maxAgeMs: 60_000 })).toBeNull();
	});

	test("supports a glob prefix instead of exact filename", () => {
		writeFileSync(join(tempDir, "superset-codex-session-1234_5678.jsonl"), "{}");
		writeFileSync(join(tempDir, "unrelated.jsonl"), "{}");
		const result = findMostRecentJsonl(tempDir, {
			maxAgeMs: 60_000,
			filenamePrefix: "superset-codex-session-",
		});
		expect(result?.path).toMatch(/superset-codex-session-/);
	});
});
```

- [ ] **Step 1.6: Run, verify the new tests fail with `findMostRecentJsonl is not exported`**

Run: `pnpm -F @superset/desktop test src/main/lib/transcript-discovery/index.test.ts`
Expected: 5 new failures.

- [ ] **Step 1.7: Implement `findMostRecentJsonl`**

Append to `index.ts`:

```ts
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface FindOptions {
	/** Only return files modified within this many ms of `now`. */
	maxAgeMs: number;
	/** If set, only consider filenames starting with this prefix. */
	filenamePrefix?: string;
	/** Override "now" — exposed for tests. Defaults to `Date.now()`. */
	now?: number;
}

export interface DiscoveredFile {
	path: string;
	mtimeMs: number;
}

/**
 * Returns the most recently modified `.jsonl` file in `dir`, restricted to
 * files modified within `maxAgeMs` of now. Returns `null` when nothing matches
 * or the directory doesn't exist.
 */
export function findMostRecentJsonl(
	dir: string,
	opts: FindOptions,
): DiscoveredFile | null {
	if (!existsSync(dir)) return null;

	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return null;
	}

	const now = opts.now ?? Date.now();
	const cutoff = now - opts.maxAgeMs;

	let best: DiscoveredFile | null = null;
	for (const name of entries) {
		if (!name.endsWith(".jsonl")) continue;
		if (opts.filenamePrefix && !name.startsWith(opts.filenamePrefix)) continue;

		const fullPath = join(dir, name);
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(fullPath);
		} catch {
			continue;
		}
		if (!stat.isFile()) continue;
		if (stat.mtimeMs < cutoff) continue;

		if (!best || stat.mtimeMs > best.mtimeMs) {
			best = { path: fullPath, mtimeMs: stat.mtimeMs };
		}
	}

	return best;
}
```

- [ ] **Step 1.8: Run, verify all `findMostRecentJsonl` tests pass**

Run: `pnpm -F @superset/desktop test src/main/lib/transcript-discovery/index.test.ts`
Expected: 9 passing tests.

- [ ] **Step 1.9: Add failing test for `findRecentTranscript`**

Append to `index.test.ts`:

```ts
describe("findRecentTranscript", () => {
	let claudeProjectsDir: string;
	let codexTmpDir: string;
	let cwd: string;

	beforeEach(() => {
		const root = mkdtempSync(join(tmpdir(), "transcript-discovery-fr-"));
		cwd = join(root, "Users", "test", "project");
		mkdirSync(cwd, { recursive: true });
		claudeProjectsDir = join(root, ".claude", "projects");
		codexTmpDir = join(root, "codex-tmp");
		mkdirSync(codexTmpDir, { recursive: true });
	});

	test("returns null when neither Claude nor Codex has anything", () => {
		expect(
			findRecentTranscript({
				cwd,
				claudeProjectsRoot: claudeProjectsDir,
				codexTmpDir,
				maxAgeMs: 60_000,
			}),
		).toBeNull();
	});

	test("finds a Claude Code transcript when one exists", () => {
		const encoded = encodeClaudeProjectsDir(cwd);
		const projectDir = join(claudeProjectsDir, encoded);
		mkdirSync(projectDir, { recursive: true });
		const sessionFile = join(projectDir, "abc-123.jsonl");
		writeFileSync(sessionFile, '{"type":"user"}\n');

		const result = findRecentTranscript({
			cwd,
			claudeProjectsRoot: claudeProjectsDir,
			codexTmpDir,
			maxAgeMs: 60_000,
		});
		expect(result?.source).toBe("claude-code");
		expect(result?.file.path).toBe(sessionFile);
	});

	test("finds a Codex transcript when one exists", () => {
		const sessionFile = join(codexTmpDir, "superset-codex-session-1234_5678.jsonl");
		writeFileSync(sessionFile, '{"type":"session_meta"}\n');

		const result = findRecentTranscript({
			cwd,
			claudeProjectsRoot: claudeProjectsDir,
			codexTmpDir,
			maxAgeMs: 60_000,
		});
		expect(result?.source).toBe("codex");
		expect(result?.file.path).toBe(sessionFile);
	});

	test("prefers whichever transcript was modified more recently", () => {
		// Claude file: older
		const encoded = encodeClaudeProjectsDir(cwd);
		const projectDir = join(claudeProjectsDir, encoded);
		mkdirSync(projectDir, { recursive: true });
		const claudeFile = join(projectDir, "abc.jsonl");
		writeFileSync(claudeFile, "{}");
		const past = new Date(Date.now() - 10_000);
		utimesSync(claudeFile, past, past);

		// Codex file: newer
		const codexFile = join(codexTmpDir, "superset-codex-session-1_2.jsonl");
		writeFileSync(codexFile, "{}");

		const result = findRecentTranscript({
			cwd,
			claudeProjectsRoot: claudeProjectsDir,
			codexTmpDir,
			maxAgeMs: 60_000,
		});
		expect(result?.source).toBe("codex");
	});
});
```

- [ ] **Step 1.10: Run, verify failures**

Run: `pnpm -F @superset/desktop test src/main/lib/transcript-discovery/index.test.ts`
Expected: 4 new failures (`findRecentTranscript is not exported`).

- [ ] **Step 1.11: Implement `findRecentTranscript`**

Append to `index.ts`:

```ts
import { homedir, tmpdir } from "node:os";

export type TranscriptSource = "claude-code" | "codex";

export interface DiscoveredTranscript {
	source: TranscriptSource;
	file: DiscoveredFile;
}

export interface FindRecentTranscriptOptions {
	/** Working directory of the terminal whose session we're trying to capture. */
	cwd: string;
	/** Override `~/.claude/projects` — exposed for tests. */
	claudeProjectsRoot?: string;
	/** Override `${TMPDIR}` — exposed for tests. */
	codexTmpDir?: string;
	/** Only consider files modified within this many ms. */
	maxAgeMs: number;
	/** Override "now" — exposed for tests. */
	now?: number;
}

/**
 * Tries to discover the most recent Claude Code or Codex transcript file
 * associated with `cwd`. Returns whichever source produced the most
 * recently-modified file, or `null` if neither has anything fresh.
 *
 * Heuristic: there is no reliable per-session ID tracking today, so we glob
 * the directories Claude Code and our Codex wrapper write to, and pick the
 * newest file. This can match the wrong session if multiple agent processes
 * are running concurrently in the same workspace.
 */
export function findRecentTranscript(
	opts: FindRecentTranscriptOptions,
): DiscoveredTranscript | null {
	const claudeRoot =
		opts.claudeProjectsRoot ?? join(homedir(), ".claude", "projects");
	const codexDir = opts.codexTmpDir ?? tmpdir();

	const encoded = encodeClaudeProjectsDir(opts.cwd);
	const claudeDir = join(claudeRoot, encoded);

	const claudeFile = findMostRecentJsonl(claudeDir, {
		maxAgeMs: opts.maxAgeMs,
		now: opts.now,
	});
	const codexFile = findMostRecentJsonl(codexDir, {
		maxAgeMs: opts.maxAgeMs,
		now: opts.now,
		filenamePrefix: "superset-codex-session-",
	});

	if (!claudeFile && !codexFile) return null;
	if (claudeFile && !codexFile) {
		return { source: "claude-code", file: claudeFile };
	}
	if (codexFile && !claudeFile) {
		return { source: "codex", file: codexFile };
	}
	// Both exist — pick whichever is newer.
	return claudeFile!.mtimeMs >= codexFile!.mtimeMs
		? { source: "claude-code", file: claudeFile! }
		: { source: "codex", file: codexFile! };
}
```

- [ ] **Step 1.12: Run all tests in the file, verify pass**

Run: `pnpm -F @superset/desktop test src/main/lib/transcript-discovery/index.test.ts`
Expected: 13 passing tests, 0 failures.

- [ ] **Step 1.13: Add `readTranscriptFile` helper (no test — wraps fs)**

Append to `index.ts`:

```ts
import { readFileSync } from "node:fs";

/** Portal `/api/sessions/ingest` enforces a 5MB body limit. */
export const MAX_TRANSCRIPT_BYTES = 5 * 1024 * 1024;

export interface ReadTranscriptResult {
	content: string;
	bytes: number;
}

/**
 * Reads a transcript file from disk, enforcing the portal's 5MB cap.
 * Throws `Error` with a user-facing message on failure.
 */
export function readTranscriptFile(path: string): ReadTranscriptResult {
	let stat: ReturnType<typeof statSync>;
	try {
		stat = statSync(path);
	} catch (err) {
		throw new Error(
			`Could not read transcript file: ${(err as Error).message}`,
		);
	}
	if (stat.size > MAX_TRANSCRIPT_BYTES) {
		throw new Error(
			`Transcript file is ${(stat.size / 1024 / 1024).toFixed(1)}MB; portal limit is 5MB`,
		);
	}
	const content = readFileSync(path, "utf-8");
	return { content, bytes: stat.size };
}
```

- [ ] **Step 1.14: Run typecheck on the package**

Run: `pnpm -F @superset/desktop typecheck`
Expected: 0 errors. (If `tsr generate` complains about routes not existing, the `pretypecheck` step will handle it.)

---

## Task 2: Update portal router

**Files:**
- Modify: `apps/desktop/src/lib/trpc/routers/portal/index.ts`

- [ ] **Step 2.1: Switch the ingest URL from `/api/coding-sessions/ingest` to `/api/sessions/ingest`**

In `apps/desktop/src/lib/trpc/routers/portal/index.ts`, change line 155:

```ts
// BEFORE
return portalFetch("/api/coding-sessions/ingest", {

// AFTER
return portalFetch("/api/sessions/ingest", {
```

- [ ] **Step 2.2: Extend the `sessions.ingest` zod schema with optional fields**

Replace the existing `sessions.ingest` mutation block with:

```ts
ingest: publicProcedure
    .input(
        z.object({
            projectId: z.string(),
            transcript: z.string(),
            branchName: z.string().optional(),
            source: z.enum(["claude-code", "codex"]).optional(),
            sessionStartedAt: z.string().optional(),
            sessionEndedAt: z.string().optional(),
            prUrl: z.string().optional(),
            prNumber: z.number().optional(),
        }),
    )
    .mutation(async ({ input }) => {
        return portalFetch("/api/sessions/ingest", {
            method: "POST",
            body: JSON.stringify(input),
        });
    }),
```

Note: `branchName` is now optional (it was required before but the portal accepts it as optional).

- [ ] **Step 2.3: Add new imports at the top of `portal/index.ts`**

```ts
// Add to existing imports
import { dialog } from "electron";
import {
	findRecentTranscript,
	readTranscriptFile,
} from "main/lib/transcript-discovery";
import { appState } from "main/lib/app-state";
import { getMainWindow } from "main/windows/main";
```

> Verify the exact named export for getting the main window — if the existing `window` router uses a different helper (e.g. `getWindow`), use that one instead. Search `apps/desktop/src/lib/trpc/routers/window.ts` for the import to copy.

- [ ] **Step 2.4: Add `sessions.captureAndIngest` procedure**

Inside the `sessions: router({ ... })` block, after `list`, add:

```ts
captureAndIngest: publicProcedure
    .input(
        z.object({
            projectId: z.string(),
            paneId: z.string(),
            /** Look back this many ms for a recently modified transcript. Default 10 min. */
            maxAgeMs: z.number().optional(),
        }),
    )
    .mutation(async ({ input }) => {
        // Look up the pane's cwd from main-process app state
        const pane = appState.data.tabsState.panes?.[input.paneId];
        if (!pane) {
            return {
                status: "skipped" as const,
                reason: "pane-not-found",
            };
        }
        const cwd = pane.cwd ?? pane.initialCwd;
        if (!cwd) {
            return {
                status: "skipped" as const,
                reason: "no-cwd",
            };
        }

        const discovered = findRecentTranscript({
            cwd,
            maxAgeMs: input.maxAgeMs ?? 10 * 60 * 1000,
        });
        if (!discovered) {
            return {
                status: "skipped" as const,
                reason: "no-recent-transcript",
            };
        }

        let transcript: string;
        try {
            transcript = readTranscriptFile(discovered.file.path).content;
        } catch (err) {
            console.warn(
                "[portal] captureAndIngest: failed to read transcript",
                discovered.file.path,
                err,
            );
            return {
                status: "skipped" as const,
                reason: "read-failed",
            };
        }

        const sessionEndedAt = new Date(discovered.file.mtimeMs).toISOString();

        const response = (await portalFetch("/api/sessions/ingest", {
            method: "POST",
            body: JSON.stringify({
                projectId: input.projectId,
                transcript,
                source: discovered.source,
                sessionEndedAt,
            }),
        })) as { id?: string; messageCount?: number };

        return {
            status: "uploaded" as const,
            source: discovered.source,
            sessionId: response.id,
            messageCount: response.messageCount,
        };
    }),
```

- [ ] **Step 2.5: Add `sessions.uploadFromFilePicker` procedure**

After `captureAndIngest`, add:

```ts
uploadFromFilePicker: publicProcedure
    .input(
        z.object({
            projectId: z.string(),
        }),
    )
    .mutation(async ({ input }) => {
        const window = getMainWindow();
        if (!window) {
            throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "No active window",
            });
        }

        const result = await dialog.showOpenDialog(window, {
            title: "Select session transcript",
            properties: ["openFile"],
            filters: [
                { name: "JSONL transcript", extensions: ["jsonl"] },
                { name: "All files", extensions: ["*"] },
            ],
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { status: "canceled" as const };
        }

        const filePath = result.filePaths[0];
        let transcript: string;
        try {
            transcript = readTranscriptFile(filePath).content;
        } catch (err) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: (err as Error).message,
            });
        }

        // Heuristic: filenames matching `superset-codex-session-*.jsonl` are Codex.
        const source: "claude-code" | "codex" = filePath.includes(
            "superset-codex-session-",
        )
            ? "codex"
            : "claude-code";

        const response = (await portalFetch("/api/sessions/ingest", {
            method: "POST",
            body: JSON.stringify({
                projectId: input.projectId,
                transcript,
                source,
            }),
        })) as { id?: string; messageCount?: number };

        return {
            status: "uploaded" as const,
            source,
            sessionId: response.id,
            messageCount: response.messageCount,
            filePath,
        };
    }),
```

- [ ] **Step 2.6: Type-check**

Run: `pnpm -F @superset/desktop typecheck`
Expected: 0 errors. If imports for `appState`/`getMainWindow` are wrong, fix them by mirroring the imports used in `apps/desktop/src/lib/trpc/routers/window.ts` and `apps/desktop/src/lib/trpc/routers/config/config.ts`.

---

## Task 3: Wire renderer auto-capture

**Files:**
- Modify: `apps/desktop/src/renderer/hooks/useStudioSessionCapture.ts`

- [ ] **Step 3.1: Replace the file contents**

```ts
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioMode } from "renderer/providers/StudioModeProvider";
import { useStudioActiveProjectId } from "renderer/stores/studio-state";

/**
 * Hook that listens for terminal exit events and auto-captures Claude Code /
 * Codex transcripts to the venture studio portal. Only active when STUDIO_MODE
 * is enabled and the user is authenticated to the portal.
 *
 * Best-effort: skips silently if no transcript was found in the workspace.
 */
export function useStudioSessionCapture() {
	const { isStudioMode, isAuthenticated } = useStudioMode();
	const projectId = useStudioActiveProjectId();
	const captureMutation =
		electronTrpc.portal.sessions.captureAndIngest.useMutation();

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		enabled: isStudioMode && isAuthenticated && !!projectId,
		onData: (event) => {
			if (event.type !== "terminal-exit") return;
			if (!projectId) return;
			const paneId = event.data?.paneId;
			if (!paneId) return;

			// Fire and forget — never interrupt student workflow.
			// The main-process procedure handles cwd lookup, transcript discovery,
			// reading, and posting to the portal. If no transcript was found within
			// the freshness window, it returns { status: "skipped" } and we ignore.
			captureMutation.mutate(
				{ projectId, paneId },
				{
					onError: (err) => {
						console.warn(
							"[studio-capture] auto-ingest failed:",
							err.message,
						);
					},
				},
			);
		},
	});
}
```

- [ ] **Step 3.2: Type-check**

Run: `pnpm -F @superset/desktop typecheck`
Expected: 0 errors.

---

## Task 4: Wire UploadSessionButton

**Files:**
- Modify: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/sessions/components/UploadSessionButton/UploadSessionButton.tsx`

- [ ] **Step 4.1: Replace the file contents**

```tsx
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { HiOutlineArrowUpTray } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioActiveProjectId } from "renderer/stores/studio-state";

export function UploadSessionButton() {
	const projectId = useStudioActiveProjectId();
	const uploadMutation =
		electronTrpc.portal.sessions.uploadFromFilePicker.useMutation({
			onSuccess: (result) => {
				if (result.status === "canceled") return;
				toast.success(
					`Uploaded ${result.messageCount ?? "?"} messages from ${result.source}`,
				);
			},
			onError: (err) => {
				toast.error(`Upload failed: ${err.message}`);
			},
		});

	function handleUpload() {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}
		uploadMutation.mutate({ projectId });
	}

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={handleUpload}
			disabled={uploadMutation.isPending || !projectId}
		>
			<HiOutlineArrowUpTray className="h-4 w-4 mr-1.5" />
			{uploadMutation.isPending ? "Uploading..." : "Upload Session"}
		</Button>
	);
}
```

> If `useMutation` returns `isLoading` instead of `isPending` in this codebase's tRPC version, swap accordingly. Check the existing `ingestMutation.isPending` usage in adjacent components.

- [ ] **Step 4.2: Type-check**

Run: `pnpm -F @superset/desktop typecheck`
Expected: 0 errors.

---

## Task 5: Final verification + commit

- [ ] **Step 5.1: Run the full type-check across the desktop package**

Run: `pnpm -F @superset/desktop typecheck`
Expected: 0 errors.

- [ ] **Step 5.2: Run the full test suite**

Run: `pnpm -F @superset/desktop test`
Expected: All tests pass, including the 13 new ones in `transcript-discovery/index.test.ts`.

- [ ] **Step 5.3: Sanity-check that we didn't break the legacy URL**

The portal still has `/api/coding-sessions/ingest` as a rewrite stub, so even old desktop builds keep working. No portal-side change required as part of this PR.

- [ ] **Step 5.4: Commit on the existing `feat/portal-transcript-ingest` branch**

```bash
cd /Users/jesseluo/Documents/workspaces/superset
git add apps/desktop/src/main/lib/transcript-discovery \
        apps/desktop/src/lib/trpc/routers/portal/index.ts \
        apps/desktop/src/renderer/hooks/useStudioSessionCapture.ts \
        apps/desktop/src/renderer/routes/_authenticated/_dashboard/sessions/components/UploadSessionButton/UploadSessionButton.tsx \
        apps/desktop/plans/2026-04-07-portal-transcript-ingest.md
git commit -m "$(cat <<'EOF'
feat(desktop): ship real Claude Code/Codex transcripts to portal

- Add transcript-discovery util that encodes a workspace cwd to Claude Code's
  ~/.claude/projects/<encoded>/ dir and globs both Claude Code and Codex JSONL
  files, returning the most recently modified one within a freshness window.
- Add portal.sessions.captureAndIngest tRPC procedure: looks up the pane's cwd
  from app state, discovers the recent transcript, reads it (5MB cap), and
  POSTs to /api/sessions/ingest with source + sessionEndedAt.
- Add portal.sessions.uploadFromFilePicker procedure: opens an Electron file
  dialog, reads the selected .jsonl, and posts it. Replaces the manual upload
  stub.
- Switch portal.sessions.ingest from /api/coding-sessions/ingest (a backward-
  compat rewrite stub) to the canonical /api/sessions/ingest, and extend the
  zod schema with optional source/sessionStartedAt/sessionEndedAt/prUrl/prNumber.
- Wire useStudioSessionCapture to pass paneId from terminal-exit events into
  the new captureAndIngest procedure.
- Wire UploadSessionButton to use the file picker procedure.

Both flows do all I/O in the main process so transcripts never round-trip
across IPC. Auth remains Bearer-token via Supabase JWT — no API secret keys
required client-side.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5.5: Confirm with the user before pushing or opening a PR**

Don't push or `gh pr create` until the user explicitly says so.

---

## Self-review

**Spec coverage:**
- ✅ Read actual transcript file (Task 1, Task 2.4)
- ✅ Send `source` field (Task 2.4, 2.5)
- ✅ Send `sessionStartedAt`/`sessionEndedAt` (Task 2.4 — only `sessionEndedAt` from mtime, since we don't know start time without parsing)
- ✅ Switch URL to `/api/sessions/ingest` (Task 2.1)
- ✅ File picker for manual upload (Task 2.5, Task 4)
- ✅ No new API secret keys (still Bearer JWT)

**Placeholder scan:** No "TBD"/"implement later" remain. Two `>` callouts ask the executor to verify exact named exports (`getMainWindow`, `useMutation.isPending`) — those are real verification steps, not placeholders.

**Type consistency:** `findRecentTranscript` returns `{ source, file }`, used consistently in Task 2.4. `readTranscriptFile` returns `{ content, bytes }`, only `.content` is used. Mutation return shapes include a discriminated `status` field that the renderer matches against in Task 4.
