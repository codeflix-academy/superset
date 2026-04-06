import { Button } from "@superset/ui/button";
import { LuLink } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface PortalLinkPromptProps {
	localProjectId: string | null;
	isAuthenticated: boolean;
}

export function PortalLinkPrompt({
	localProjectId,
	isAuthenticated,
}: PortalLinkPromptProps) {
	const utils = electronTrpc.useUtils();

	const linkMutation = electronTrpc.projects.linkPortal.useMutation({
		onSuccess: (data) => {
			if (data.portalProjectId) {
				utils.workspaces.get.invalidate();
				utils.workspaces.getAllGrouped.invalidate();
			}
		},
	});

	const noMatch = linkMutation.isSuccess && !linkMutation.data.portalProjectId;

	if (!isAuthenticated) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
				<LuLink className="size-8 text-muted-foreground" />
				<div className="space-y-1">
					<p className="text-sm font-medium">Link to Portal</p>
					<p className="text-xs text-muted-foreground">
						Sign in to the portal to link this workspace.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
			<LuLink className="size-8 text-muted-foreground" />
			<div className="space-y-1">
				<p className="text-sm font-medium">Link to Portal</p>
				<p className="text-xs text-muted-foreground">
					This workspace isn't linked to a portal project yet.
				</p>
			</div>
			<Button
				size="sm"
				disabled={!localProjectId || linkMutation.isPending}
				onClick={() => {
					if (localProjectId) {
						linkMutation.mutate({ projectId: localProjectId });
					}
				}}
			>
				{linkMutation.isPending ? "Linking..." : "Link to Portal"}
			</Button>
			{noMatch && (
				<p className="text-xs text-muted-foreground">
					No matching portal project found for this repository.
				</p>
			)}
			{linkMutation.isError && (
				<p className="text-xs text-destructive">{linkMutation.error.message}</p>
			)}
			<p className="text-xs text-muted-foreground max-w-xs">
				We'll match this repo's GitHub URL to your portal projects.
			</p>
		</div>
	);
}
