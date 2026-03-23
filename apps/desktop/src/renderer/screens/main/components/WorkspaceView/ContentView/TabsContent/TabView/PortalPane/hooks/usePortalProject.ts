import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioMode } from "renderer/providers/StudioModeProvider";

/**
 * Returns the stored portal project ID for a workspace.
 * No dynamic resolution — reads from the persisted `portalProjectId` column.
 */
export function usePortalProject(workspaceId: string) {
	const { isAuthenticated } = useStudioMode();

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);

	return {
		portalProjectId: workspace?.project?.portalProjectId ?? null,
		localProjectId: workspace?.project?.id ?? null,
		isAuthenticated,
		workspaceName: workspace?.project?.name ?? workspace?.name ?? null,
	};
}
