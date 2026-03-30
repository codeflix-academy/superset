import { projects, workspaces, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { portalFetch } from "lib/trpc/routers/portal";
import { getTranscriptPath, readTranscript } from "./transcript-reader";

const DEBOUNCE_MS = 30_000; // 30 seconds
const MAX_PENDING_MS = 5 * 60_000; // 5 minutes — force flush after this

const LOG_PREFIX = "[session-upload]";

interface PendingSession {
	claudeSessionId: string;
	workspaceId: string;
	portalProjectId: string;
	workspacePath: string;
	firstStopAt: number;
	timer: ReturnType<typeof setTimeout>;
}

interface UploadRecord {
	fileByteSize: number;
	uploadedAt: number;
}

/**
 * Resolves a workspaceId to the portal project ID and workspace path.
 * Returns null if the workspace is not linked to a portal project.
 */
function resolveWorkspace(workspaceId: string): {
	portalProjectId: string;
	workspacePath: string;
} | null {
	const workspace = localDb
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();

	if (!workspace) return null;

	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, workspace.projectId))
		.get();

	if (!project?.portalProjectId) return null;

	let workspacePath: string | null = null;
	if (workspace.type === "branch") {
		workspacePath = project.mainRepoPath;
	} else if (workspace.worktreeId) {
		const worktree = localDb
			.select()
			.from(worktrees)
			.where(eq(worktrees.id, workspace.worktreeId))
			.get();
		workspacePath = worktree?.path ?? null;
	}

	if (!workspacePath) return null;

	return {
		portalProjectId: project.portalProjectId,
		workspacePath,
	};
}

export class SessionUploadQueue {
	private pending = new Map<string, PendingSession>();
	private uploadHistory = new Map<string, UploadRecord>();

	/**
	 * Handle a Stop event from Claude Code.
	 * Starts or resets the debounce timer for this session.
	 */
	handleStopEvent(event: {
		sessionId?: string;
		workspaceId?: string;
	}): void {
		const { sessionId: claudeSessionId, workspaceId } = event;

		if (!claudeSessionId || !workspaceId) {
			return; // Can't upload without both IDs
		}

		const existing = this.pending.get(claudeSessionId);

		if (existing) {
			// Already pending — reset debounce timer
			clearTimeout(existing.timer);

			const elapsed = Date.now() - existing.firstStopAt;
			if (elapsed > MAX_PENDING_MS) {
				// Been pending too long — flush immediately
				console.log(
					`${LOG_PREFIX} Max pending time exceeded for ${claudeSessionId}, flushing now`,
				);
				this.pending.delete(claudeSessionId);
				void this.flushSession(existing);
				return;
			}

			existing.timer = setTimeout(() => {
				this.pending.delete(claudeSessionId);
				void this.flushSession(existing);
			}, DEBOUNCE_MS);
			return;
		}

		// New session — resolve workspace
		const resolved = resolveWorkspace(workspaceId);
		if (!resolved) {
			return; // Workspace not linked to portal
		}

		console.log(
			`${LOG_PREFIX} Queued ${claudeSessionId} (project=${resolved.portalProjectId})`,
		);

		const pending: PendingSession = {
			claudeSessionId,
			workspaceId,
			portalProjectId: resolved.portalProjectId,
			workspacePath: resolved.workspacePath,
			firstStopAt: Date.now(),
			timer: setTimeout(() => {
				this.pending.delete(claudeSessionId);
				void this.flushSession(pending);
			}, DEBOUNCE_MS),
		};

		this.pending.set(claudeSessionId, pending);
	}

	/**
	 * Upload a single session's transcript to the portal.
	 */
	private async flushSession(session: PendingSession): Promise<void> {
		const { claudeSessionId, portalProjectId, workspacePath } = session;

		try {
			const transcriptPath = getTranscriptPath(workspacePath, claudeSessionId);
			const result = await readTranscript(transcriptPath);

			if (!result) {
				console.log(
					`${LOG_PREFIX} No transcript file for ${claudeSessionId}`,
				);
				return;
			}

			// Skip if file size unchanged since last upload
			const prevUpload = this.uploadHistory.get(claudeSessionId);
			if (prevUpload && prevUpload.fileByteSize === result.byteSize) {
				console.log(
					`${LOG_PREFIX} Skipping ${claudeSessionId} — unchanged (${result.byteSize} bytes)`,
				);
				return;
			}

			console.log(
				`${LOG_PREFIX} Uploading ${claudeSessionId} (${result.byteSize} bytes)`,
			);

			await portalFetch("/api/coding-sessions/ingest", {
				method: "POST",
				body: JSON.stringify({
					projectId: portalProjectId,
					transcript: result.content,
					source: "claude-code",
					externalSessionId: claudeSessionId,
				}),
			});

			this.uploadHistory.set(claudeSessionId, {
				fileByteSize: result.byteSize,
				uploadedAt: Date.now(),
			});

			console.log(`${LOG_PREFIX} Uploaded ${claudeSessionId}`);
		} catch (err) {
			// Log and drop — next Stop will retry if file size differs
			console.error(
				`${LOG_PREFIX} Failed to upload ${claudeSessionId}:`,
				err,
			);
		}
	}

	/**
	 * Flush all pending sessions for a given workspace immediately.
	 * Used on terminal exit.
	 */
	flushForWorkspace(workspaceId: string): void {
		for (const [sessionId, pending] of this.pending) {
			if (pending.workspaceId === workspaceId) {
				clearTimeout(pending.timer);
				this.pending.delete(sessionId);
				void this.flushSession(pending);
			}
		}
	}

	/**
	 * Flush all pending sessions immediately.
	 * Used on app quit.
	 */
	async flushAll(): Promise<void> {
		const sessions = Array.from(this.pending.values());
		for (const session of sessions) {
			clearTimeout(session.timer);
		}
		this.pending.clear();

		await Promise.allSettled(
			sessions.map((session) => this.flushSession(session)),
		);
	}
}
