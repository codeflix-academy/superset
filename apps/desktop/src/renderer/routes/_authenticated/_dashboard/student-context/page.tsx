import { createFileRoute } from "@tanstack/react-router";
import { useStudioMode } from "renderer/providers/StudioModeProvider";
import { InterestsList } from "./components/InterestsList";
import { StudentProfile } from "./components/StudentProfile";
import { TraitsDisplay } from "./components/TraitsDisplay";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/student-context/",
)({
	component: StudentContextPage,
});

function StudentContextPage() {
	const { isAuthenticated } = useStudioMode();

	if (!isAuthenticated) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				Sign in to the portal to view your context.
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full w-full overflow-hidden">
			<div className="p-6 border-b">
				<h1 className="text-xl font-semibold">My Context</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Your student profile, traits, and interests
				</p>
			</div>
			<div className="flex-1 overflow-auto p-6 space-y-6">
				<StudentProfile />
				<TraitsDisplay />
				<InterestsList />
			</div>
		</div>
	);
}
