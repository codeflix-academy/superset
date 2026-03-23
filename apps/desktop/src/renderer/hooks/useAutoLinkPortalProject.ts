/**
 * Previously auto-linked portal projects by resolving git remotes at render time.
 * Now a no-op — portal project linking happens server-side on project creation
 * (resolveAndLinkPortalProject) and persists as `portalProjectId` in the local DB.
 *
 * This hook is kept as a stub to avoid breaking call sites during migration.
 */
export function useAutoLinkPortalProject(
	_mainRepoPath: string | null | undefined,
) {
	// No-op: portal linking is now handled on the backend
}
