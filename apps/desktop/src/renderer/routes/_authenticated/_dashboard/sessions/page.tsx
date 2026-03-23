import { createFileRoute } from "@tanstack/react-router";
import { useStudioMode } from "renderer/providers/StudioModeProvider";
import { SessionsList } from "./components/SessionsList";
import { UploadSessionButton } from "./components/UploadSessionButton";

export const Route = createFileRoute("/_authenticated/_dashboard/sessions/")({
	component: SessionsPage,
});

function SessionsPage() {
	const { isAuthenticated } = useStudioMode();

	if (!isAuthenticated) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				Sign in to the portal to view sessions.
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full w-full overflow-hidden">
			<div className="p-6 border-b flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold">Coding Sessions</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Your recent coding sessions and uploads
					</p>
				</div>
				<UploadSessionButton />
			</div>
			<div className="flex-1 overflow-auto p-6">
				<SessionsList />
			</div>
		</div>
	);
}
