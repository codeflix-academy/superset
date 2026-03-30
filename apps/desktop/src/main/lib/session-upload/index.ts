import { env } from "main/env.main";
import { notificationsEmitter } from "main/lib/notifications/server";
import { NOTIFICATION_EVENTS } from "shared/constants";
import type { AgentLifecycleEvent } from "shared/notification-types";
import { SessionUploadQueue } from "./queue";

const LOG_PREFIX = "[session-upload]";

let queue: SessionUploadQueue | null = null;

/**
 * Initialize the session upload service.
 * Listens for Stop events from Claude Code and uploads transcripts
 * to the portal after a debounce period.
 *
 * Only activates when STUDIO_MODE is enabled.
 */
export function initSessionUpload(): void {
	if (!env.STUDIO_MODE) return;

	queue = new SessionUploadQueue();

	// Listen for Stop events from Claude Code
	notificationsEmitter.on(
		NOTIFICATION_EVENTS.AGENT_LIFECYCLE,
		(event: AgentLifecycleEvent) => {
			if (event.eventType === "Stop") {
				queue?.handleStopEvent({
					sessionId: event.sessionId,
					workspaceId: event.workspaceId,
				});
			}
		},
	);

	// Listen for terminal exits — flush all pending sessions.
	// Terminal exit events only carry paneId (no workspaceId), so we
	// flush everything. Typically only 1-3 sessions are pending.
	notificationsEmitter.on(NOTIFICATION_EVENTS.TERMINAL_EXIT, () => {
		void queue?.flushAll();
	});

	console.log(`${LOG_PREFIX} Initialized`);
}

/**
 * Shutdown the session upload service.
 * Flushes all pending sessions before the app quits.
 */
export async function shutdownSessionUpload(): Promise<void> {
	if (!queue) return;

	console.log(`${LOG_PREFIX} Shutting down — flushing pending sessions`);
	await queue.flushAll();
	queue = null;
}
