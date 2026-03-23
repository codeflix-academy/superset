import { TRPCError } from "@trpc/server";
import { env } from "main/env.main";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getPortalAccessToken } from "../studio-auth";

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

	const response = await fetch(url, {
		...options,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
			...options.headers,
		},
	});

	if (!response.ok) {
		console.error(
			`[portal] ${method} ${path} → ${response.status} ${response.statusText}`,
		);
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Portal API error: ${response.status} ${response.statusText}`,
		});
	}

	console.log(`[portal] ${method} ${path} → ${response.status}`);
	return response.json();
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
					const response = (await portalFetch(
						`/api/tasks?${params.toString()}`,
					)) as { data: unknown[] };
					return response.data;
				}),

			get: publicProcedure
				.input(z.object({ taskId: z.string() }))
				.query(async ({ input }) => {
					return portalFetch(`/api/tasks/${input.taskId}`);
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
						branchName: z.string(),
						transcript: z.string(),
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
