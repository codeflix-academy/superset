import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioMode } from "renderer/providers/StudioModeProvider";
import { useStudioActiveProjectId } from "renderer/stores/studio-state";

/**
 * Hook that listens for terminal exit events and auto-captures Claude Code /
 * Codex transcripts to the venture studio portal. Only active when STUDIO_MODE
 * is enabled and the user is authenticated to the portal.
 *
 * Best-effort: the main-process procedure handles cwd lookup, transcript
 * discovery, reading, and posting. If no fresh transcript is found, it
 * returns `{ status: "skipped" }` and we ignore.
 */
export function useStudioSessionCapture() {
	const { isStudioMode, isAuthenticated } = useStudioMode();
	const projectId = useStudioActiveProjectId();
	const captureMutation =
		electronTrpc.portal.sessions.captureAndIngest.useMutation();

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		enabled: isStudioMode && isAuthenticated && !!projectId,
		onData: (event) => {
			if (event.type !== "terminal-exit") return;
			if (!projectId) return;
			const paneId = event.data?.paneId;
			if (!paneId) return;

			// Fire and forget — never interrupt student workflow.
			captureMutation.mutate(
				{ projectId, paneId },
				{
					onError: (err) => {
						console.warn("[studio-capture] auto-ingest failed:", err.message);
					},
				},
			);
		},
	});
}
