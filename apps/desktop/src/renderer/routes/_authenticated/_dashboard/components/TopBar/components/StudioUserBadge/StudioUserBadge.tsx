import { useStudioMode } from "renderer/providers/StudioModeProvider";

/**
 * Small badge showing portal connection status.
 * Rendered as a floating element to avoid modifying TopBar.tsx.
 */
export function StudioUserBadge() {
	const { isStudioMode, isAuthenticated, user } = useStudioMode();

	if (!isStudioMode || !isAuthenticated || !user) {
		return null;
	}

	return (
		<div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-1.5 bg-card border rounded-full shadow-sm text-xs text-muted-foreground">
			<div className="w-1.5 h-1.5 rounded-full bg-green-500" />
			<span className="truncate max-w-[150px]">{user.email}</span>
		</div>
	);
}
