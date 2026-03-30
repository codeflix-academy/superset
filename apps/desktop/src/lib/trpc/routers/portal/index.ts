import { TRPCError } from "@trpc/server";
import { env } from "main/env.main";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	forceRefreshPortalToken,
	getPortalAccessToken,
} from "../studio-auth";

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

export const createPortalRouter = () => {
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
						branchName: z.string().optional(),
						transcript: z.string(),
						externalSessionId: z.string().optional(),
						source: z.string().optional(),
					}),
				)
				.mutation(async ({ input }) => {
					return portalFetch("/api/coding-sessions/ingest", {
						method: "POST",
						body: JSON.stringify(input),
					});
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
