import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	encodeClaudeProjectsDir,
	findMostRecentJsonl,
	findRecentTranscript,
} from "./index";

describe("encodeClaudeProjectsDir", () => {
	test("encodes a plain Unix path by replacing / with -", () => {
		expect(encodeClaudeProjectsDir("/Users/jesseluo")).toBe("-Users-jesseluo");
	});

	test("encodes dots in path segments to -", () => {
		expect(
			encodeClaudeProjectsDir("/Users/jesseluo/.superset/worktrees/x"),
		).toBe("-Users-jesseluo--superset-worktrees-x");
	});

	test("preserves existing dashes in segment names", () => {
		expect(
			encodeClaudeProjectsDir(
				"/Users/me/Documents/workspaces/venture-studio-portal",
			),
		).toBe("-Users-me-Documents-workspaces-venture-studio-portal");
	});

	test("handles trailing slash", () => {
		expect(encodeClaudeProjectsDir("/Users/me/")).toBe("-Users-me-");
	});
});

describe("findMostRecentJsonl", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "transcript-discovery-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("returns null when directory does not exist", () => {
		expect(
			findMostRecentJsonl("/nonexistent/path", { maxAgeMs: 60_000 }),
		).toBeNull();
	});

	test("returns null when directory has no .jsonl files", () => {
		writeFileSync(join(tempDir, "not-a-transcript.txt"), "x");
		expect(findMostRecentJsonl(tempDir, { maxAgeMs: 60_000 })).toBeNull();
	});

	test("returns the most recently modified .jsonl file", () => {
		const older = join(tempDir, "older.jsonl");
		const newer = join(tempDir, "newer.jsonl");
		writeFileSync(older, "{}");
		writeFileSync(newer, "{}");
		// Force older to be 5s in the past
		const past = new Date(Date.now() - 5_000);
		utimesSync(older, past, past);

		const result = findMostRecentJsonl(tempDir, { maxAgeMs: 60_000 });
		expect(result?.path).toBe(newer);
	});

	test("respects maxAgeMs and returns null when nothing is fresh enough", () => {
		const old = join(tempDir, "old.jsonl");
		writeFileSync(old, "{}");
		const past = new Date(Date.now() - 120_000); // 2 minutes old
		utimesSync(old, past, past);

		expect(findMostRecentJsonl(tempDir, { maxAgeMs: 60_000 })).toBeNull();
	});

	test("supports a filename prefix filter", () => {
		writeFileSync(
			join(tempDir, "superset-codex-session-1234_5678.jsonl"),
			"{}",
		);
		writeFileSync(join(tempDir, "unrelated.jsonl"), "{}");
		const result = findMostRecentJsonl(tempDir, {
			maxAgeMs: 60_000,
			filenamePrefix: "superset-codex-session-",
		});
		expect(result?.path).toMatch(/superset-codex-session-/);
	});
});

describe("findRecentTranscript", () => {
	let claudeProjectsRoot: string;
	let codexTmpDir: string;
	let cwd: string;
	let rootDir: string;

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), "transcript-discovery-fr-"));
		cwd = join(rootDir, "Users", "test", "project");
		mkdirSync(cwd, { recursive: true });
		claudeProjectsRoot = join(rootDir, ".claude", "projects");
		codexTmpDir = join(rootDir, "codex-tmp");
		mkdirSync(codexTmpDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	test("returns null when neither Claude nor Codex has anything", () => {
		expect(
			findRecentTranscript({
				cwd,
				claudeProjectsRoot,
				codexTmpDir,
				maxAgeMs: 60_000,
			}),
		).toBeNull();
	});

	test("finds a Claude Code transcript when one exists", () => {
		const encoded = encodeClaudeProjectsDir(cwd);
		const projectDir = join(claudeProjectsRoot, encoded);
		mkdirSync(projectDir, { recursive: true });
		const sessionFile = join(projectDir, "abc-123.jsonl");
		writeFileSync(sessionFile, '{"type":"user"}\n');

		const result = findRecentTranscript({
			cwd,
			claudeProjectsRoot,
			codexTmpDir,
			maxAgeMs: 60_000,
		});
		expect(result?.source).toBe("claude-code");
		expect(result?.file.path).toBe(sessionFile);
	});

	test("finds a Codex transcript when one exists", () => {
		const sessionFile = join(
			codexTmpDir,
			"superset-codex-session-1234_5678.jsonl",
		);
		writeFileSync(sessionFile, '{"type":"session_meta"}\n');

		const result = findRecentTranscript({
			cwd,
			claudeProjectsRoot,
			codexTmpDir,
			maxAgeMs: 60_000,
		});
		expect(result?.source).toBe("codex");
		expect(result?.file.path).toBe(sessionFile);
	});

	test("prefers whichever transcript was modified more recently", () => {
		// Claude file: older
		const encoded = encodeClaudeProjectsDir(cwd);
		const projectDir = join(claudeProjectsRoot, encoded);
		mkdirSync(projectDir, { recursive: true });
		const claudeFile = join(projectDir, "abc.jsonl");
		writeFileSync(claudeFile, "{}");
		const past = new Date(Date.now() - 10_000);
		utimesSync(claudeFile, past, past);

		// Codex file: newer
		const codexFile = join(codexTmpDir, "superset-codex-session-1_2.jsonl");
		writeFileSync(codexFile, "{}");

		const result = findRecentTranscript({
			cwd,
			claudeProjectsRoot,
			codexTmpDir,
			maxAgeMs: 60_000,
		});
		expect(result?.source).toBe("codex");
	});

	test("ignores Codex files that don't match the superset prefix", () => {
		writeFileSync(join(codexTmpDir, "random-file.jsonl"), "{}");
		expect(
			findRecentTranscript({
				cwd,
				claudeProjectsRoot,
				codexTmpDir,
				maxAgeMs: 60_000,
			}),
		).toBeNull();
	});
});
