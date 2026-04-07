import { TRPCError } from "@trpc/server";
import { type BrowserWindow, dialog } from "electron";
import { appState } from "main/lib/app-state";
import { env } from "main/env.main";
import {
	findRecentTranscript,
	readTranscriptFile,
} from "main/lib/transcript-discovery";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { forceRefreshPortalToken, getPortalAccessToken } from "../studio-auth";

async function doFetch(url: string, token: string, options: RequestInit) {
	return fetch(url, {
		...options,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
			...options.headers,
		},
	});
}

export async function portalFetch(path: string, options: RequestInit = {}) {
	const apiUrl = env.PORTAL_API_URL;
	if (!apiUrl) {
		console.warn("[portal] PORTAL_API_URL is not configured");
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "PORTAL_API_URL is not configured",
		});
	}

	const token = await getPortalAccessToken();
	if (!token) {
		console.warn("[portal] No access token — not authenticated");
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Not authenticated to portal",
		});
	}

	const method = options.method ?? "GET";
	const url = `${apiUrl}${path}`;
	console.log(`[portal] ${method} ${url}`);

	let response = await doFetch(url, token, options);

	// Retry once on 401 after refreshing the token
	if (response.status === 401) {
		console.warn(`[portal] ${method} ${path} → 401, refreshing token…`);
		const freshToken = await forceRefreshPortalToken();
		if (freshToken) {
			response = await doFetch(url, freshToken, options);
		}
	}

	if (!response.ok) {
		let body = "";
		try {
			body = await response.text();
		} catch {}
		console.error(
			`[portal] ${method} ${path} → ${response.status} ${response.statusText}`,
			body,
		);
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Portal API error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`,
		});
	}

	console.log(`[portal] ${method} ${path} → ${response.status}`);

	// Handle empty responses (e.g. 204 No Content)
	const text = await response.text();
	if (!text) return {};
	try {
		return JSON.parse(text);
	} catch {
		return {};
	}
}

export const createPortalRouter = (
	getWindow: () => BrowserWindow | null,
) => {
	return router({
		tasks: router({
			list: publicProcedure
				.input(z.object({ projectId: z.string().optional() }).optional())
				.query(async ({ input }) => {
					// Portal API requires projectId — return empty when none selected
					if (!input?.projectId) return [];
					const params = new URLSearchParams();
					params.set("projectId", input.projectId);
					params.set("paginate", "false");
					const response = (await portalFetch(
						`/api/tasks?${params.toString()}`,
					)) as { tasks: unknown[] };
					return response.tasks;
				}),

			get: publicProcedure
				.input(z.object({ taskId: z.string() }))
				.query(async ({ input }) => {
					return portalFetch(`/api/tasks/${input.taskId}`);
				}),

			update: publicProcedure
				.input(
					z.object({
						taskId: z.string(),
						status: z.string().optional(),
						title: z.string().optional(),
						description: z.string().optional(),
						priority: z.string().optional(),
						assigneeId: z.string().nullable().optional(),
					}),
				)
				.mutation(async ({ input }) => {
					const { taskId, ...patch } = input;
					return portalFetch(`/api/tasks/${taskId}`, {
						method: "PATCH",
						body: JSON.stringify(patch),
					});
				}),

			create: publicProcedure
				.input(
					z.object({
						projectId: z.string(),
						title: z.string(),
						description: z.string().optional(),
						status: z.string().optional(),
						priority: z.string().optional(),
					}),
				)
				.mutation(async ({ input }) => {
					return portalFetch("/api/tasks", {
						method: "POST",
						body: JSON.stringify(input),
					});
				}),
		}),

		context: router({
			get: publicProcedure.query(async () => {
				return portalFetch("/api/me/context");
			}),
		}),

		sessions: router({
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

			/**
			 * Auto-capture entrypoint called from the renderer's terminal-exit
			 * subscription. Looks up the pane's cwd from main-process app state,
			 * discovers the most recent Claude Code or Codex transcript file,
			 * reads it (5MB cap), and POSTs to the portal. Best-effort: returns
			 * `{ status: "skipped" }` if there's nothing to upload.
			 */
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
					const pane = appState.data.tabsState.panes?.[input.paneId];
					if (!pane) {
						return {
							status: "skipped" as const,
							reason: "pane-not-found" as const,
						};
					}
					const cwd = pane.cwd ?? pane.initialCwd;
					if (!cwd) {
						return {
							status: "skipped" as const,
							reason: "no-cwd" as const,
						};
					}

					const discovered = findRecentTranscript({
						cwd,
						maxAgeMs: input.maxAgeMs ?? 10 * 60 * 1000,
					});
					if (!discovered) {
						return {
							status: "skipped" as const,
							reason: "no-recent-transcript" as const,
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
							reason: "read-failed" as const,
						};
					}

					const sessionEndedAt = new Date(
						discovered.file.mtimeMs,
					).toISOString();

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

			/**
			 * Manual upload entrypoint. Opens a native file picker for `.jsonl`
			 * transcript files, reads the chosen file (5MB cap), and POSTs it.
			 * Returns `{ status: "canceled" }` if the user dismisses the dialog.
			 */
			uploadFromFilePicker: publicProcedure
				.input(
					z.object({
						projectId: z.string(),
					}),
				)
				.mutation(async ({ input }) => {
					const window = getWindow();
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

					// Heuristic: filenames matching `superset-codex-session-*.jsonl`
					// come from our Codex wrapper script; everything else we treat
					// as Claude Code.
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

			list: publicProcedure
				.input(z.object({ projectId: z.string().optional() }).optional())
				.query(async ({ input }) => {
					const params = new URLSearchParams();
					if (input?.projectId) params.set("projectId", input.projectId);
					const query = params.toString();
					return portalFetch(`/api/coding-sessions${query ? `?${query}` : ""}`);
				}),
		}),

		connection: router({
			status: publicProcedure.query(async () => {
				const token = await getPortalAccessToken();
				return {
					connected: !!token,
					portalUrl: env.PORTAL_API_URL ?? null,
				};
			}),
		}),
	});
};
