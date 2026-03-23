import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioActiveProjectId } from "renderer/stores/studio-state";
import { PortalTaskCard } from "../PortalTaskCard";

interface Task {
	id: string;
	title: string;
	description?: string;
	status: string;
	priority?: string;
	assignee?: { name: string; email: string };
}

export function PortalTasksList() {
	const projectId = useStudioActiveProjectId();
	const { data, isLoading, error } = electronTrpc.portal.tasks.list.useQuery(
		projectId ? { projectId } : undefined,
	);

	if (isLoading) {
		return (
			<div className="space-y-3">
				{["s1", "s2", "s3", "s4", "s5"].map((id) => (
					<div key={id} className="h-20 rounded-lg bg-muted animate-pulse" />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="text-sm text-destructive">
				Failed to load tasks: {error.message}
			</div>
		);
	}

	const tasks = (data as Task[] | undefined) ?? [];

	if (tasks.length === 0) {
		return (
			<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
				No tasks found
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{tasks.map((task) => (
				<PortalTaskCard key={task.id} task={task} />
			))}
		</div>
	);
}
