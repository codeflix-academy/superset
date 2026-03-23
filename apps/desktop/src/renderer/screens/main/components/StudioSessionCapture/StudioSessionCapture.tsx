import { env } from "renderer/env.renderer";
import { useStudioSessionCapture } from "renderer/hooks/useStudioSessionCapture";

/**
 * Renderless component that mounts the session auto-capture hook.
 * Only active when STUDIO_MODE is enabled.
 */
export function StudioSessionCapture() {
	if (!env.STUDIO_MODE) {
		return null;
	}

	return <StudioSessionCaptureInner />;
}

function StudioSessionCaptureInner() {
	useStudioSessionCapture();
	return null;
}
