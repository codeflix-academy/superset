import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const MAX_TRANSCRIPT_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Encode a workspace path to match Claude Code's project directory naming.
 * Replaces `/` with `-` and `.` with `-` to produce e.g.
 * `-Users-jesseluo-Documents-workspaces-venture-studio-portal`
 */
export function encodeWorkspacePath(workspacePath: string): string {
	return workspacePath.replace(/[/.]/g, "-");
}

/**
 * Get the full path to a Claude Code transcript JSONL file.
 */
export function getTranscriptPath(
	workspacePath: string,
	claudeSessionId: string,
): string {
	const encoded = encodeWorkspacePath(workspacePath);
	return join(homedir(), ".claude", "projects", encoded, `${claudeSessionId}.jsonl`);
}

/**
 * Read a transcript file from disk.
 * If the file exceeds MAX_TRANSCRIPT_BYTES, truncates from the beginning
 * (keeps the most recent turns).
 */
export async function readTranscript(
	filePath: string,
): Promise<{ content: string; byteSize: number } | null> {
	try {
		const buffer = await readFile(filePath);
		const byteSize = buffer.length;

		if (byteSize > MAX_TRANSCRIPT_BYTES) {
			// Truncate from beginning — keep last 5MB
			const truncated = buffer.subarray(byteSize - MAX_TRANSCRIPT_BYTES);
			// Find the first complete line (skip partial first line)
			const newlineIdx = truncated.indexOf(0x0a); // '\n'
			const content =
				newlineIdx >= 0
					? truncated.subarray(newlineIdx + 1).toString("utf-8")
					: truncated.toString("utf-8");
			return { content, byteSize };
		}

		return { content: buffer.toString("utf-8"), byteSize };
	} catch (err: unknown) {
		if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
			return null;
		}
		throw err;
	}
}

/**
 * Get the file size of a transcript without reading it.
 * Returns null if the file doesn't exist.
 */
export async function getTranscriptSize(
	filePath: string,
): Promise<number | null> {
	try {
		const stats = await stat(filePath);
		return stats.size;
	} catch {
		return null;
	}
}
