import { createFileRoute } from "@tanstack/react-router";
import { useStudioMode } from "renderer/providers/StudioModeProvider";
import { PortalTasksList } from "./components/PortalTasksList";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/portal-tasks/",
)({
	component: PortalTasksPage,
});

function PortalTasksPage() {
	const { isAuthenticated } = useStudioMode();

	if (!isAuthenticated) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				Sign in to the portal to view tasks.
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full w-full overflow-hidden">
			<div className="p-6 border-b">
				<h1 className="text-xl font-semibold">Portal Tasks</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Tasks assigned to you from the venture studio portal
				</p>
			</div>
			<div className="flex-1 overflow-auto p-6">
				<PortalTasksList />
			</div>
		</div>
	);
}
