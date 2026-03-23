import { stripeClient } from "@better-auth/stripe/client";
import type { auth } from "@superset/auth/server";
import {
	apiKeyClient,
	customSessionClient,
	jwtClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "renderer/env.renderer";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
	authToken = token;
}

export function getAuthToken(): string | null {
	return authToken;
}

let jwt: string | null = null;

export function setJwt(token: string | null) {
	jwt = token;
}

export function getJwt(): string | null {
	return jwt;
}

/**
 * In studio mode, return a fake empty response so Better Auth never hits the
 * network. Studio auth (Supabase OTP) handles authentication instead.
 */
const noopFetch: typeof globalThis.fetch = async () =>
	new Response(JSON.stringify({ session: null }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});

/**
 * Better Auth client for Electron desktop app.
 *
 * In studio mode, a no-op fetch is used so the client never makes real
 * network requests. Call sites (useSession, etc.) still work without crashing.
 */
export const authClient = createAuthClient({
	baseURL: env.NEXT_PUBLIC_API_URL,
	...(env.STUDIO_MODE && { customFetchImpl: noopFetch }),
	plugins: [
		organizationClient(),
		customSessionClient<typeof auth>(),
		stripeClient({ subscription: true }),
		apiKeyClient(),
		jwtClient(),
	],
	fetchOptions: {
		credentials: "include",
		onRequest: async (context) => {
			const token = getAuthToken();
			if (token) {
				context.headers.set("Authorization", `Bearer ${token}`);
			}
		},
		onResponse: async (context) => {
			const token = context.response.headers.get("set-auth-jwt");
			if (token) {
				setJwt(token);
			}
		},
	},
});
