import { electronTrpc } from "renderer/lib/electron-trpc";

interface Session {
	id: string;
	branchName: string;
	createdAt: string;
	messageCount?: number;
	status?: string;
}

interface PortalSessionsViewProps {
	projectId: string | null;
}

export function PortalSessionsView({ projectId }: PortalSessionsViewProps) {
	const { data, isLoading, error } = electronTrpc.portal.sessions.list.useQuery(
		projectId ? { projectId } : undefined,
	);

	if (isLoading) {
		return (
			<div className="space-y-3 p-4">
				{["s1", "s2", "s3"].map((id) => (
					<div key={id} className="h-16 rounded-lg bg-muted animate-pulse" />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-4 text-sm text-destructive">
				Failed to load sessions: {error.message}
			</div>
		);
	}

	const sessions = (data as Session[] | undefined) ?? [];

	if (sessions.length === 0) {
		return (
			<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
				{projectId
					? "No sessions yet. Make commits or upload a session manually."
					: "No project linked to this workspace"}
			</div>
		);
	}

	return (
		<div className="space-y-3 p-4">
			{sessions.map((session) => (
				<div
					key={session.id}
					className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
				>
					<div className="flex items-center justify-between">
						<div>
							<div className="text-sm font-medium font-mono">
								{session.branchName}
							</div>
							<div className="text-xs text-muted-foreground mt-1">
								{new Date(session.createdAt).toLocaleString()}
								{session.messageCount != null &&
									` · ${session.messageCount} messages`}
							</div>
						</div>
						{session.status && (
							<span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
								{session.status}
							</span>
						)}
					</div>
				</div>
			))}
		</div>
	);
}
