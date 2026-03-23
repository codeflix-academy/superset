import { cn } from "@superset/ui/utils";

interface Task {
	id: string;
	title: string;
	description?: string;
	status: string;
	priority?: string;
	assignee?: { name: string; email: string };
}

const STATUS_STYLES: Record<string, string> = {
	TODO: "bg-muted text-muted-foreground",
	IN_PROGRESS: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
	IN_REVIEW: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
	DONE: "bg-green-500/10 text-green-600 dark:text-green-400",
};

const PRIORITY_STYLES: Record<string, string> = {
	HIGH: "text-red-500",
	MEDIUM: "text-yellow-500",
	LOW: "text-muted-foreground",
};

export function PortalTaskCard({ task }: { task: Task }) {
	const statusStyle = STATUS_STYLES[task.status] ?? STATUS_STYLES.TODO;
	const priorityStyle = task.priority
		? (PRIORITY_STYLES[task.priority] ?? "")
		: "";

	return (
		<div className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
			<div className="flex items-start justify-between gap-3">
				<div className="flex-1 min-w-0">
					<h3 className="text-sm font-medium truncate">{task.title}</h3>
					{task.description && (
						<p className="text-xs text-muted-foreground mt-1 line-clamp-2">
							{task.description}
						</p>
					)}
				</div>
				<div className="flex items-center gap-2 shrink-0">
					{task.priority && (
						<span className={cn("text-xs font-medium", priorityStyle)}>
							{task.priority}
						</span>
					)}
					<span
						className={cn(
							"text-xs px-2 py-0.5 rounded-full font-medium",
							statusStyle,
						)}
					>
						{task.status.replace(/_/g, " ")}
					</span>
				</div>
			</div>
			{task.assignee && (
				<div className="mt-2 text-xs text-muted-foreground">
					{task.assignee.name}
				</div>
			)}
		</div>
	);
}
