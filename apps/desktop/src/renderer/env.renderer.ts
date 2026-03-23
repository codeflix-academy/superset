/**
 * Environment variables for the RENDERER PROCESS (browser context).
 *
 * These values are injected at BUILD TIME by Vite's `define` in electron.vite.config.ts.
 * They are NOT read from process.env at runtime - Vite replaces the references with
 * literal strings during compilation.
 *
 * Only import this file in src/renderer/ code - never in main or shared code.
 *
 * For main process env vars, use src/main/env.main.ts instead.
 */
import { z } from "zod/v4";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	NEXT_PUBLIC_API_URL: z.url().default("https://api.superset.sh"),
	NEXT_PUBLIC_WEB_URL: z.url().default("https://app.superset.sh"),
	NEXT_PUBLIC_ELECTRIC_URL: z
		.url()
		.default("https://electric-proxy.avi-6ac.workers.dev"),
	STUDIO_MODE: z.coerce.boolean().default(false),
});

/**
 * Build-time environment variables.
 *
 * Vite replaces these process.env.* and import.meta.env.* references at build time.
 * The values are baked into the bundle as string literals.
 */
const rawEnv = {
	// These are replaced by Vite's define at build time
	NODE_ENV: process.env.NODE_ENV,
	NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
	NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
	NEXT_PUBLIC_ELECTRIC_URL: process.env.NEXT_PUBLIC_ELECTRIC_URL,
	STUDIO_MODE:
		process.env.STUDIO_MODE === "true" || process.env.STUDIO_MODE === "1",
};

// Only allow skipping validation in development (never in production).
// Studio mode implies skip — all auth/org checks use SKIP_ENV_VALIDATION,
// so deriving it here keeps the fork diff minimal (no per-file changes).
const SKIP_ENV_VALIDATION =
	(process.env.NODE_ENV === "development" &&
		!!process.env.SKIP_ENV_VALIDATION) ||
	rawEnv.STUDIO_MODE;

export const env = {
	...(SKIP_ENV_VALIDATION
		? (rawEnv as z.infer<typeof envSchema>)
		: envSchema.parse(rawEnv)),
	SKIP_ENV_VALIDATION,
};
