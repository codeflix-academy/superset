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

/** Refresh 60 seconds before the token actually expires */
const REFRESH_BUFFER_SECS = 60;

/**
 * Schedule-on-acquire: after every token save, schedule a single
 * setTimeout to refresh right before expiry. Cleared on sign-out.
 */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRefresh(expiresAt: number) {
	if (refreshTimer) clearTimeout(refreshTimer);

	const delayMs = (expiresAt - REFRESH_BUFFER_SECS - Date.now() / 1000) * 1000;
	if (delayMs <= 0) {
		// Already past the buffer — refresh immediately
		refreshStoredSession();
		return;
	}

	console.log(
		`[studio-auth] Scheduling token refresh in ${Math.round(delayMs / 1000)}s`,
	);
	refreshTimer = setTimeout(() => {
		refreshTimer = null;
		refreshStoredSession();
	}, delayMs);
}

function cancelRefreshTimer() {
	if (refreshTimer) {
		clearTimeout(refreshTimer);
		refreshTimer = null;
	}
}

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
	if (session.expiresAt) scheduleRefresh(session.expiresAt);
	studioAuthEvents.emit("session-changed", session);
}

async function clearSession(): Promise<void> {
	cancelRefreshTimer();
	await fs.unlink(TOKEN_FILE).catch(() => {});
	studioAuthEvents.emit("session-cleared");
}

/**
 * Deduplicated refresh — only one Supabase refresh call runs at a time.
 * Concurrent callers await the same in-flight promise, preventing
 * refresh-token rotation conflicts.
 */
let inflightRefresh: Promise<StoredSession | null> | null = null;

async function refreshStoredSession(): Promise<StoredSession | null> {
	if (inflightRefresh) return inflightRefresh;

	inflightRefresh = doRefresh().finally(() => {
		inflightRefresh = null;
	});
	return inflightRefresh;
}

async function doRefresh(): Promise<StoredSession | null> {
	const stored = await loadSession();
	if (!stored) return null;

	try {
		const supabase = getSupabaseClient();
		const { data, error } = await supabase.auth.refreshSession({
			refresh_token: stored.refreshToken,
		});
		if (error || !data.session) {
			console.warn("[studio-auth] Session refresh failed, clearing session");
			await clearSession();
			return null;
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
		return session;
	} catch (err) {
		console.error("[studio-auth] Error refreshing session:", err);
		return null;
	}
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
			const session = await refreshStoredSession();
			if (!session) {
				throw new Error("Session refresh failed");
			}
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
 * Initialize the refresh timer from any existing stored session.
 * Call once on app startup (main process).
 */
export async function initStudioAuth(): Promise<void> {
	const session = await loadSession();
	if (session?.expiresAt) {
		scheduleRefresh(session.expiresAt);
	}
}

/**
 * Get the stored access token for portal API calls.
 * Proactively refreshes if the token is expired or close to expiry.
 */
export async function getPortalAccessToken(): Promise<string | null> {
	const session = await loadSession();
	if (!session) return null;

	const now = Date.now() / 1000;
	if (session.expiresAt && now > session.expiresAt - REFRESH_BUFFER_SECS) {
		const refreshed = await refreshStoredSession();
		return refreshed?.accessToken ?? null;
	}

	return session.accessToken;
}

/**
 * Force-refresh the token and return the new access token.
 * Used by portalFetch to retry on 401.
 */
export async function forceRefreshPortalToken(): Promise<string | null> {
	const refreshed = await refreshStoredSession();
	return refreshed?.accessToken ?? null;
}
