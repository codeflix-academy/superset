/**
 * Transcript discovery — finds the most recent Claude Code or Codex JSONL
 * session file associated with a given workspace cwd.
 *
 * Used by the portal router's `captureAndIngest` mutation to auto-upload
 * agent transcripts to the venture studio portal on terminal exit.
 *
 * Heuristic: there is no reliable per-session ID tracking today, so we glob
 * the directories Claude Code and our Codex wrapper write to, and pick the
 * newest file modified within `maxAgeMs`. This can match the wrong session
 * if multiple agent processes are running concurrently in the same workspace
 * — acceptable for MVP.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Encodes a working directory path into Claude Code's `~/.claude/projects/`
 * subdirectory name. Claude Code replaces both `/` and `.` characters with `-`.
 *
 * Examples:
 *   /Users/me                          → -Users-me
 *   /Users/me/.config/foo              → -Users-me--config-foo
 *   /Users/me/Documents/venture-studio → -Users-me-Documents-venture-studio
 */
export function encodeClaudeProjectsDir(cwd: string): string {
	return cwd.replace(/[/.]/g, "-");
}

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

	if (claudeFile && codexFile) {
		return claudeFile.mtimeMs >= codexFile.mtimeMs
			? { source: "claude-code", file: claudeFile }
			: { source: "codex", file: codexFile };
	}
	if (claudeFile) return { source: "claude-code", file: claudeFile };
	if (codexFile) return { source: "codex", file: codexFile };
	return null;
}

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
