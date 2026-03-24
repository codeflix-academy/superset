import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { LuExternalLink, LuLink, LuLink2Off } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioMode } from "renderer/providers/StudioModeProvider";

interface PortalStatusBadgeProps {
	projectId: string;
	portalProjectId?: string | null;
	githubOwner: string | null;
}

export function PortalStatusBadge({
	projectId,
	portalProjectId,
	githubOwner,
}: PortalStatusBadgeProps) {
	const { isStudioMode, isAuthenticated } = useStudioMode();
	const [isHovered, setIsHovered] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	if (!isStudioMode) return null;

	const isLinked = !!portalProjectId;
	const githubUrl = githubOwner ? `https://github.com/${githubOwner}` : null;

	if (isLinked) {
		return <LinkedBadge githubUrl={githubUrl} projectId={projectId} />;
	}

	return (
		<UnlinkedBadge
			projectId={projectId}
			isAuthenticated={isAuthenticated}
			isHovered={isHovered}
			isOpen={isOpen}
			onHoverChange={setIsHovered}
			onOpenChange={setIsOpen}
		/>
	);
}

function LinkedBadge({
	githubUrl,
	projectId,
}: {
	githubUrl: string | null;
	projectId: string;
}) {
	const utils = electronTrpc.useUtils();
	const openUrl = electronTrpc.external.openUrl.useMutation();

	const unlinkMutation = electronTrpc.projects.unlinkPortal.useMutation({
		onSuccess: () => {
			utils.workspaces.getAllGrouped.invalidate();
		},
	});

	return (
		<Popover>
			<Tooltip delayDuration={300}>
				<PopoverTrigger asChild>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={(e) => e.stopPropagation()}
							className="shrink-0 flex items-center"
						>
							<span className="size-1.5 rounded-full bg-green-500" />
						</button>
					</TooltipTrigger>
				</PopoverTrigger>
				<TooltipContent side="right" sideOffset={4}>
					Linked to Portal
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				side="right"
				align="start"
				sideOffset={8}
				className="w-56 p-3"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="space-y-3">
					<div className="flex items-center gap-2 text-sm font-medium">
						<LuLink className="size-3.5 text-green-500" />
						Linked to Portal
					</div>

					{githubUrl && (
						<button
							type="button"
							onClick={() => openUrl.mutate(githubUrl)}
							className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
						>
							<LuExternalLink className="size-3 shrink-0" />
							<span className="truncate">{githubUrl}</span>
						</button>
					)}

					<Button
						variant="ghost"
						size="sm"
						className="w-full text-muted-foreground"
						disabled={unlinkMutation.isPending}
						onClick={() => unlinkMutation.mutate({ projectId })}
					>
						<LuLink2Off className="size-3.5 mr-1.5" />
						{unlinkMutation.isPending ? "Unlinking..." : "Unlink"}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function UnlinkedBadge({
	projectId,
	isAuthenticated,
	isHovered,
	isOpen,
	onHoverChange,
	onOpenChange,
}: {
	projectId: string;
	isAuthenticated: boolean;
	isHovered: boolean;
	isOpen: boolean;
	onHoverChange: (hovered: boolean) => void;
	onOpenChange: (open: boolean) => void;
}) {
	const utils = electronTrpc.useUtils();

	const linkMutation = electronTrpc.projects.linkPortal.useMutation({
		onSuccess: (data) => {
			if (data.portalProjectId) {
				utils.workspaces.getAllGrouped.invalidate();
				onOpenChange(false);
			}
		},
	});

	const noMatch = linkMutation.isSuccess && !linkMutation.data.portalProjectId;

	return (
		<Popover open={isOpen} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					onClick={(e) => e.stopPropagation()}
					onMouseEnter={() => onHoverChange(true)}
					onMouseLeave={() => onHoverChange(false)}
					className="shrink-0 flex items-center"
				>
					{isHovered || isOpen ? (
						<span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-medium leading-none transition-all">
							<span className="size-1.5 rounded-full bg-amber-500" />
							Unlinked
						</span>
					) : (
						<span className="size-1.5 rounded-full bg-amber-500" />
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="right"
				align="start"
				sideOffset={8}
				className="w-56 p-3"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="space-y-3">
					<p className="text-xs text-muted-foreground">
						This project isn't linked to a portal project.
					</p>

					{isAuthenticated ? (
						<>
							<Button
								size="sm"
								className="w-full"
								disabled={linkMutation.isPending}
								onClick={() => linkMutation.mutate({ projectId })}
							>
								<LuLink className="size-3.5 mr-1.5" />
								{linkMutation.isPending ? "Linking..." : "Link to Portal"}
							</Button>

							{noMatch && (
								<p className="text-xs text-muted-foreground">
									No matching portal project found.
								</p>
							)}
							{linkMutation.isError && (
								<p className="text-xs text-destructive">
									{linkMutation.error.message}
								</p>
							)}
						</>
					) : (
						<p className="text-xs text-muted-foreground">
							Sign in to link this project.
						</p>
					)}

					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						Dismiss
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
