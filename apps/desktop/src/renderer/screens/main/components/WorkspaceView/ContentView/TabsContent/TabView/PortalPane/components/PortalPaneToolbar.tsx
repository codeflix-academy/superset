import { cn } from "@superset/ui/utils";
import type { PortalActiveView } from "shared/tabs-types";

const VIEWS: { value: PortalActiveView; label: string }[] = [
	{ value: "tasks", label: "Tasks" },
	{ value: "sessions", label: "Sessions" },
	{ value: "context", label: "Context" },
];

interface PortalPaneToolbarProps {
	activeView: PortalActiveView;
	onViewChange: (view: PortalActiveView) => void;
	projectName: string | null;
}

export function PortalPaneToolbar({
	activeView,
	onViewChange,
	projectName,
}: PortalPaneToolbarProps) {
	return (
		<div className="flex items-center gap-2 min-w-0 flex-1">
			<div className="flex items-center rounded-md border border-border/60 bg-muted/30 overflow-hidden">
				{VIEWS.map((view) => (
					<button
						key={view.value}
						type="button"
						onClick={() => onViewChange(view.value)}
						className={cn(
							"px-2.5 py-0.5 text-xs font-medium transition-colors",
							activeView === view.value
								? "bg-accent text-foreground"
								: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
						)}
					>
						{view.label}
					</button>
				))}
			</div>
			{projectName && (
				<span className="text-xs text-muted-foreground truncate">
					{projectName}
				</span>
			)}
		</div>
	);
}
