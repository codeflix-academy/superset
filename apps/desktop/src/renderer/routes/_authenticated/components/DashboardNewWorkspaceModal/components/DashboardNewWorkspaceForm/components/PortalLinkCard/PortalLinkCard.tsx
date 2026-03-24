import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { LuLink, LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioMode } from "renderer/providers/StudioModeProvider";

interface PortalLinkCardProps {
	localProjectId: string | null;
}

export function PortalLinkCard({ localProjectId }: PortalLinkCardProps) {
	const { isStudioMode, isAuthenticated } = useStudioMode();
	const [dismissed, setDismissed] = useState(false);
	const utils = electronTrpc.useUtils();

	const { data: localProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();

	const linkMutation = electronTrpc.projects.linkPortal.useMutation({
		onSuccess: (data) => {
			if (data.portalProjectId) {
				toast.success("Linked to portal project");
				utils.projects.getRecents.invalidate();
			} else {
				toast.info("No matching portal project found");
			}
		},
		onError: (error) => {
			toast.error(`Failed to link: ${error.message}`);
		},
	});

	if (!isStudioMode || dismissed || !localProjectId) return null;

	const project = localProjects.find((p) => p.id === localProjectId);
	if (!project || project.portalProjectId) return null;

	return (
		<div className="mx-3 mb-3 rounded-lg border bg-card p-3">
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-2">
					<LuLink className="size-4 text-muted-foreground shrink-0" />
					<span className="text-xs font-medium">Portal</span>
				</div>
				<button
					type="button"
					onClick={() => setDismissed(true)}
					className="text-muted-foreground hover:text-foreground transition-colors p-0.5 -m-0.5"
				>
					<LuX className="size-3.5" />
				</button>
			</div>
			<p className="text-xs text-muted-foreground mt-2">
				Link this project to your portal to track tasks and sessions.
			</p>
			<div className="flex items-center gap-2 mt-3">
				{isAuthenticated ? (
					<Button
						size="sm"
						className="h-7 text-xs"
						disabled={linkMutation.isPending}
						onClick={() => linkMutation.mutate({ projectId: localProjectId })}
					>
						{linkMutation.isPending ? "Linking..." : "Link Now"}
					</Button>
				) : (
					<p className="text-xs text-muted-foreground">Sign in to link.</p>
				)}
				<button
					type="button"
					onClick={() => setDismissed(true)}
					className="text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					Skip
				</button>
			</div>
		</div>
	);
}
