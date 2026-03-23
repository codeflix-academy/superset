import { useStudioMode } from "renderer/providers/StudioModeProvider";

/**
 * Studio sidebar section. Previously showed a portal project dropdown.
 * Portal project linking is now persisted per-project, so the global dropdown
 * is no longer needed. Kept as a stub in case studio-specific sidebar items
 * are added later.
 */
export function StudioSidebarSection() {
	const { isStudioMode, isAuthenticated } = useStudioMode();

	if (!isStudioMode || !isAuthenticated) {
		return null;
	}

	// Portal project linking is now per-project (stored in local DB).
	// No global project selector needed.
	return null;
}
