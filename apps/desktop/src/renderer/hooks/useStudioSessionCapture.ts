import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioMode } from "renderer/providers/StudioModeProvider";
import { useStudioActiveProjectId } from "renderer/stores/studio-state";

/**
 * Hook that listens for terminal exit events and auto-captures coding sessions.
 * Only active when STUDIO_MODE is enabled and user is authenticated.
 */
export function useStudioSessionCapture() {
	const { isStudioMode, isAuthenticated } = useStudioMode();
	const projectId = useStudioActiveProjectId();
	const ingestMutation = electronTrpc.portal.sessions.ingest.useMutation();

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		enabled: isStudioMode && isAuthenticated && !!projectId,
		onData: (event) => {
			if (event.type !== "terminal-exit") return;
			if (!projectId) return;

			// Fire and forget — never interrupt student workflow
			ingestMutation.mutate({
				projectId,
				branchName: "auto-capture",
				transcript: JSON.stringify({
					type: "terminal-exit",
					timestamp: new Date().toISOString(),
					exitCode: event.data?.exitCode,
				}),
			});
		},
	});
}
