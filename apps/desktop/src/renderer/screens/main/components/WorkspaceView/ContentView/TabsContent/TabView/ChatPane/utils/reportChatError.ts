interface ReportChatErrorInput {
	operation: string;
	error: unknown;
	sessionId?: string | null;
	workspaceId?: string;
	paneId?: string;
	cwd?: string;
	organizationId?: string | null;
}

export function reportChatError(input: ReportChatErrorInput): void {
	console.error(`[chat] ${input.operation}`, input.error);
}
