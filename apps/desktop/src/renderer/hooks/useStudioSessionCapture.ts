/**
 * DEPRECATED: Session capture is now handled by the main process
 * via SessionUploadQueue (src/main/lib/session-upload/).
 *
 * This hook is kept as a no-op to avoid breaking component imports.
 */
export function useStudioSessionCapture() {
	// No-op — session upload moved to main process
}
