/**
 * Environment variables for the MAIN PROCESS (Node.js context).
 *
 * This file uses t3-env with process.env which works at runtime in Node.js.
 * Only import this file in src/main/ code - never in renderer or shared code.
 *
 * For renderer process env vars, use src/renderer/env.renderer.ts instead.
 */
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		NEXT_PUBLIC_API_URL: z.url().default("https://api.superset.sh"),
		NEXT_PUBLIC_STREAMS_URL: z.url().default("https://streams.superset.sh"),
		NEXT_PUBLIC_ELECTRIC_URL: z
			.url()
			.default("https://electric-proxy.avi-6ac.workers.dev"),
		NEXT_PUBLIC_WEB_URL: z.url().default("https://app.superset.sh"),
		NEXT_PUBLIC_MARKETING_URL: z.url().default("https://superset.sh"),
		STREAMS_URL: z.url().default("https://superset-stream.fly.dev"),
		STUDIO_MODE: z.coerce.boolean().default(false),
		PORTAL_SUPABASE_URL: z.string().optional(),
		PORTAL_SUPABASE_ANON_KEY: z.string().optional(),
		PORTAL_API_URL: z.string().optional(),
	},

	runtimeEnv: {
		...process.env,
		// Explicitly list env vars so Vite can replace them at build time
		// (spreading process.env only works at runtime, not for bundled apps)
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_STREAMS_URL: process.env.NEXT_PUBLIC_STREAMS_URL,
		NEXT_PUBLIC_ELECTRIC_URL: process.env.NEXT_PUBLIC_ELECTRIC_URL,
		NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
		NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
		STREAMS_URL: process.env.STREAMS_URL,
		STUDIO_MODE: process.env.STUDIO_MODE,
		PORTAL_SUPABASE_URL: process.env.PORTAL_SUPABASE_URL,
		PORTAL_SUPABASE_ANON_KEY: process.env.PORTAL_SUPABASE_ANON_KEY,
		PORTAL_API_URL: process.env.PORTAL_API_URL,
	},
	emptyStringAsUndefined: true,
	// Only allow skipping validation in development (never in production)
	skipValidation:
		process.env.NODE_ENV === "development" && !!process.env.SKIP_ENV_VALIDATION,

	// Main process runs in trusted Node.js environment
	isServer: true,
});
