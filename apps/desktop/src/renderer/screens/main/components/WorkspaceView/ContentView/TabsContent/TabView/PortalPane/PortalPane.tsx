import { useCallback } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { PortalActiveView } from "shared/tabs-types";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { PortalContextView } from "./components/PortalContextView";
import { PortalLinkPrompt } from "./components/PortalLinkPrompt";
import { PortalPaneToolbar } from "./components/PortalPaneToolbar";
import { PortalSessionsView } from "./components/PortalSessionsView";
import { PortalTasksView } from "./components/PortalTasksView";
import { usePortalProject } from "./hooks/usePortalProject";

interface PortalPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	workspaceId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function PortalPane({
	paneId,
	path,
	tabId,
	workspaceId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: PortalPaneProps) {
	const pane = useTabsStore((s) => s.panes[paneId]);
	const setPortalActiveView = useTabsStore((s) => s.setPortalActiveView);
	const activeView = pane?.portal?.activeView ?? "tasks";

	const { portalProjectId, localProjectId, isAuthenticated, workspaceName } =
		usePortalProject(workspaceId);

	const handleViewChange = useCallback(
		(view: PortalActiveView) => {
			setPortalActiveView(paneId, view);
		},
		[paneId, setPortalActiveView],
	);

	const renderContent = () => {
		if (!isAuthenticated || !portalProjectId) {
			return (
				<PortalLinkPrompt
					localProjectId={localProjectId}
					isAuthenticated={isAuthenticated}
				/>
			);
		}

		if (activeView === "tasks") {
			return <PortalTasksView projectId={portalProjectId} />;
		}
		if (activeView === "sessions") {
			return <PortalSessionsView projectId={portalProjectId} />;
		}
		return <PortalContextView />;
	};

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={(handlers) => (
				<div className="flex h-full w-full items-center justify-between min-w-0">
					<PortalPaneToolbar
						activeView={activeView}
						onViewChange={handleViewChange}
						projectName={workspaceName}
					/>
					<div className="flex items-center shrink-0">
						<div className="mx-1.5 h-3.5 w-px bg-muted-foreground/60" />
						<PaneToolbarActions
							splitOrientation={handlers.splitOrientation}
							onSplitPane={handlers.onSplitPane}
							onClosePane={handlers.onClosePane}
							closeHotkeyId="CLOSE_TERMINAL"
						/>
					</div>
				</div>
			)}
		>
			<div className="flex flex-col h-full w-full overflow-auto">
				{renderContent()}
			</div>
		</BasePaneWindow>
	);
}
