import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { observable } from "@trpc/server/observable";
import { env } from "main/env.main";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { decrypt, encrypt } from "../auth/utils/crypto-storage";

const STUDIO_HOME_DIR = join(homedir(), ".studio-desktop");
const TOKEN_FILE = join(STUDIO_HOME_DIR, "auth-token.enc");

interface StoredSession {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	user: {
		id: string;
		email: string;
	};
}

export const studioAuthEvents = new EventEmitter();

function getSupabaseClient() {
	const url = env.PORTAL_SUPABASE_URL;
	const anonKey = env.PORTAL_SUPABASE_ANON_KEY;
	if (!url || !anonKey) {
		throw new Error(
			"PORTAL_SUPABASE_URL and PORTAL_SUPABASE_ANON_KEY must be set when STUDIO_MODE is enabled",
		);
	}
	return createClient(url, anonKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

async function ensureStudioHomeDir() {
	await fs.mkdir(STUDIO_HOME_DIR, { recursive: true, mode: 0o700 });
}

async function loadSession(): Promise<StoredSession | null> {
	try {
		const data = decrypt(await fs.readFile(TOKEN_FILE));
		return JSON.parse(data) as StoredSession;
	} catch {
		return null;
	}
}

async function saveSession(session: StoredSession): Promise<void> {
	await ensureStudioHomeDir();
	await fs.writeFile(TOKEN_FILE, encrypt(JSON.stringify(session)), {
		mode: 0o600,
	});
	studioAuthEvents.emit("session-changed", session);
}

async function clearSession(): Promise<void> {
	await fs.unlink(TOKEN_FILE).catch(() => {});
	studioAuthEvents.emit("session-cleared");
}

export const createStudioAuthRouter = () => {
	return router({
		sendOtp: publicProcedure
			.input(z.object({ email: z.string().email() }))
			.mutation(async ({ input }) => {
				const supabase = getSupabaseClient();
				const { error } = await supabase.auth.signInWithOtp({
					email: input.email,
				});
				if (error) {
					throw new Error(`Failed to send OTP: ${error.message}`);
				}
				return { success: true };
			}),

		verifyOtp: publicProcedure
			.input(
				z.object({
					email: z.string().email(),
					token: z.string().min(6),
				}),
			)
			.mutation(async ({ input }) => {
				const supabase = getSupabaseClient();
				const { data, error } = await supabase.auth.verifyOtp({
					email: input.email,
					token: input.token,
					type: "email",
				});
				if (error) {
					throw new Error(`OTP verification failed: ${error.message}`);
				}
				if (!data.session || !data.user) {
					throw new Error("No session returned from OTP verification");
				}

				const session: StoredSession = {
					accessToken: data.session.access_token,
					refreshToken: data.session.refresh_token,
					expiresAt: data.session.expires_at ?? 0,
					user: {
						id: data.user.id,
						email: data.user.email ?? input.email,
					},
				};

				await saveSession(session);
				return { success: true, user: session.user };
			}),

		getStoredSession: publicProcedure.query(async () => {
			const session = await loadSession();
			if (!session) return null;

			// Check if expired
			if (session.expiresAt && Date.now() / 1000 > session.expiresAt) {
				return null;
			}
			return {
				user: session.user,
				expiresAt: session.expiresAt,
			};
		}),

		refreshSession: publicProcedure.mutation(async () => {
			const stored = await loadSession();
			if (!stored) {
				throw new Error("No stored session to refresh");
			}

			const supabase = getSupabaseClient();
			const { data, error } = await supabase.auth.refreshSession({
				refresh_token: stored.refreshToken,
			});
			if (error || !data.session) {
				await clearSession();
				throw new Error("Session refresh failed");
			}

			const session: StoredSession = {
				accessToken: data.session.access_token,
				refreshToken: data.session.refresh_token,
				expiresAt: data.session.expires_at ?? 0,
				user: {
					id: data.session.user.id,
					email: data.session.user.email ?? stored.user.email,
				},
			};

			await saveSession(session);
			return { success: true, user: session.user };
		}),

		getUser: publicProcedure.query(async () => {
			const session = await loadSession();
			if (!session) return null;
			return session.user;
		}),

		signOut: publicProcedure.mutation(async () => {
			await clearSession();
			return { success: true };
		}),

		onSessionChanged: publicProcedure.subscription(() => {
			return observable<{
				type: "changed" | "cleared";
				user?: { id: string; email: string };
			}>((emit) => {
				const handleChanged = (session: StoredSession) => {
					emit.next({ type: "changed", user: session.user });
				};
				const handleCleared = () => {
					emit.next({ type: "cleared" });
				};

				studioAuthEvents.on("session-changed", handleChanged);
				studioAuthEvents.on("session-cleared", handleCleared);

				return () => {
					studioAuthEvents.off("session-changed", handleChanged);
					studioAuthEvents.off("session-cleared", handleCleared);
				};
			});
		}),
	});
};

/**
 * Get the stored access token for portal API calls.
 * Used by the portal router to authenticate requests.
 */
export async function getPortalAccessToken(): Promise<string | null> {
	const session = await loadSession();
	if (!session) return null;
	if (session.expiresAt && Date.now() / 1000 > session.expiresAt) {
		return null;
	}
	return session.accessToken;
}
