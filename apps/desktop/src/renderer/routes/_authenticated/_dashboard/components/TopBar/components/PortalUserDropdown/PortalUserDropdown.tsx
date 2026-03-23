import { COMPANY } from "@superset/shared/constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { FaDiscord, FaGithub, FaXTwitter } from "react-icons/fa6";
import {
	HiChevronUpDown,
	HiOutlineArrowRightOnRectangle,
	HiOutlineBookOpen,
	HiOutlineChatBubbleLeftRight,
	HiOutlineCog6Tooth,
	HiOutlineEnvelope,
	HiOutlineUser,
} from "react-icons/hi2";
import { IoBugOutline } from "react-icons/io5";
import { LuKeyboard } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioMode } from "renderer/providers/StudioModeProvider";
import { useHotkeyText } from "renderer/stores/hotkeys";

export function PortalUserDropdown() {
	const { isAuthenticated, user } = useStudioMode();
	const signOutMutation = electronTrpc.studioAuth.signOut.useMutation();
	const navigate = useNavigate();
	const settingsHotkey = useHotkeyText("OPEN_SETTINGS");
	const shortcutsHotkey = useHotkeyText("SHOW_HOTKEYS");

	function handleSignOut(): void {
		signOutMutation.mutate();
	}

	function openExternal(url: string): void {
		window.open(url, "_blank");
	}

	const displayName = user?.email ?? "Not signed in";
	const statusColor = isAuthenticated
		? "bg-green-500"
		: "bg-muted-foreground/40";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="no-drag flex items-center gap-1.5 h-6 px-1.5 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring"
					aria-label="User menu"
				>
					<div className="flex items-center justify-center size-4">
						<div className={`size-2 rounded-full ${statusColor}`} />
					</div>
					<span className="text-xs font-medium truncate max-w-32">
						{isAuthenticated ? (user?.email ?? "Portal") : "Not signed in"}
					</span>
					<HiChevronUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				{isAuthenticated && user && (
					<>
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							<div className="flex items-center gap-2">
								<HiOutlineUser className="h-3.5 w-3.5" />
								<span className="truncate">{displayName}</span>
							</div>
						</div>
						<DropdownMenuSeparator />
					</>
				)}

				<DropdownMenuItem
					onSelect={() => navigate({ to: "/settings/account" })}
				>
					<HiOutlineCog6Tooth className="h-4 w-4" />
					<span>Settings</span>
					{settingsHotkey !== "Unassigned" && (
						<DropdownMenuShortcut>{settingsHotkey}</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>

				<DropdownMenuSeparator />

				<DropdownMenuItem onClick={() => openExternal(COMPANY.DOCS_URL)}>
					<HiOutlineBookOpen className="h-4 w-4" />
					Documentation
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => navigate({ to: "/settings/keyboard" })}
				>
					<LuKeyboard className="h-4 w-4" />
					Keyboard Shortcuts
					{shortcutsHotkey !== "Unassigned" && (
						<DropdownMenuShortcut>{shortcutsHotkey}</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => openExternal(COMPANY.REPORT_ISSUE_URL)}
				>
					<IoBugOutline className="h-4 w-4" />
					Report Issue
				</DropdownMenuItem>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<HiOutlineChatBubbleLeftRight className="h-4 w-4" />
						Contact Us
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent sideOffset={8} className="w-56">
						<DropdownMenuItem
							onClick={() => openExternal(COMPANY.GITHUB_URL)}
						>
							<FaGithub className="h-4 w-4" />
							GitHub
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => openExternal(COMPANY.DISCORD_URL)}
						>
							<FaDiscord className="h-4 w-4" />
							Discord
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => openExternal(COMPANY.X_URL)}>
							<FaXTwitter className="h-4 w-4" />X
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => openExternal(COMPANY.MAIL_TO)}>
							<HiOutlineEnvelope className="h-4 w-4" />
							Email Founders
						</DropdownMenuItem>
					</DropdownMenuSubContent>
				</DropdownMenuSub>

				{isAuthenticated && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={handleSignOut} className="gap-2">
							<HiOutlineArrowRightOnRectangle className="h-4 w-4" />
							<span>Log out</span>
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
