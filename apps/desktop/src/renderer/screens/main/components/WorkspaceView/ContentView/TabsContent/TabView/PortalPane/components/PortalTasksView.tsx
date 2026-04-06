import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogDescription,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiXMark } from "react-icons/hi2";
import {
	LuGripVertical,
	LuMessageSquare,
	LuPencil,
	LuPlus,
	LuX,
} from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import remarkGfm from "remark-gfm";
import { electronTrpc } from "renderer/lib/electron-trpc";
import "./portal-tasks.css";

// ─── Types ──────────────────────────────────────────────────────────

interface TaskLabel {
	id: string;
	name: string;
	color: string;
}

interface Task {
	id: string;
	title: string;
	description?: string | null;
	status: string;
	priority?: string;
	dueDate?: string | null;
	assignee?: {
		id: string;
		name: string;
		avatar?: string | null;
		role?: string;
	} | null;
	creator?: { id: string; name: string; avatar?: string | null } | null;
	labels?: TaskLabel[];
	_count?: { comments: number };
}

type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";

const TASK_DND_TYPE = "PORTAL_TASK";

interface TaskDragItem {
	taskId: string;
	fromStatus: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const STATUS_ORDER: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];

const STATUS_CONFIG: Record<
	TaskStatus,
	{ label: string; color: string; dotColor: string }
> = {
	TODO: {
		label: "To Do",
		color: "text-muted-foreground",
		dotColor: "bg-muted-foreground",
	},
	IN_PROGRESS: {
		label: "In Progress",
		color: "text-blue-500",
		dotColor: "bg-blue-500",
	},
	IN_REVIEW: {
		label: "In Review",
		color: "text-yellow-500",
		dotColor: "bg-yellow-500",
	},
	DONE: {
		label: "Done",
		color: "text-green-500",
		dotColor: "bg-green-500",
	},
};

const PRIORITY_STYLES: Record<string, string> = {
	HIGH: "bg-red-500/10 text-red-600 dark:text-red-400",
	MEDIUM: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
	LOW: "bg-muted text-muted-foreground",
};

// ─── Root ───────────────────────────────────────────────────────────

interface PortalTasksViewProps {
	projectId: string | null;
}

export function PortalTasksView({ projectId }: PortalTasksViewProps) {
	const { data, isLoading, error } = electronTrpc.portal.tasks.list.useQuery(
		projectId ? { projectId } : undefined,
	);

	if (isLoading) {
		return (
			<div className="flex gap-3 p-3 h-full">
				{["s1", "s2", "s3", "s4"].map((id) => (
					<div
						key={id}
						className="flex-1 rounded-lg bg-muted/50 animate-pulse"
					/>
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-4 text-sm text-destructive">
				Failed to load tasks: {error.message}
			</div>
		);
	}

	const tasks = (data as Task[] | undefined) ?? [];

	return <KanbanBoard tasks={tasks} projectId={projectId} />;
}

// ─── Board ──────────────────────────────────────────────────────────

function KanbanBoard({
	tasks,
	projectId,
}: {
	tasks: Task[];
	projectId: string | null;
}) {
	const utils = electronTrpc.useUtils();
	const queryKey = projectId ? { projectId } : undefined;
	const [selectedTask, setSelectedTask] = useState<Task | null>(null);

	const updateMutation = electronTrpc.portal.tasks.update.useMutation({
		onMutate: async ({ taskId, status: newStatus }) => {
			if (!newStatus) return {};
			try {
				await utils.portal.tasks.list.cancel(queryKey);
			} catch {}
			const previous = utils.portal.tasks.list.getData(queryKey);
			if (Array.isArray(previous)) {
				const updated = previous.map((t: unknown) => {
					const task = t as Record<string, unknown>;
					return task.id === taskId ? { ...task, status: newStatus } : task;
				});
				utils.portal.tasks.list.setData(queryKey, updated as typeof previous);
			}
			return { previous };
		},
		onError: (err, _vars, context) => {
			console.error("[portal] task update failed:", err.message);
			if (context?.previous) {
				utils.portal.tasks.list.setData(
					queryKey,
					context.previous as typeof context.previous,
				);
			}
		},
		onSettled: () => {
			if (projectId) utils.portal.tasks.list.invalidate({ projectId });
		},
	});

	const handleDropTask = useCallback(
		(taskId: string, newStatus: string) => {
			updateMutation.mutate({ taskId, status: newStatus });
		},
		[updateMutation],
	);

	const handleTaskClick = useCallback((task: Task) => {
		setSelectedTask(task);
	}, []);

	const grouped = useMemo(() => {
		const map = new Map<TaskStatus, Task[]>();
		for (const status of STATUS_ORDER) map.set(status, []);
		for (const task of tasks) {
			const status = (task.status as TaskStatus) || "TODO";
			const list = map.get(status);
			if (list) list.push(task);
			else map.get("TODO")?.push(task);
		}
		return map;
	}, [tasks]);

	// Keep selectedTask in sync with latest data
	const liveSelectedTask = useMemo(() => {
		if (!selectedTask) return null;
		return tasks.find((t) => t.id === selectedTask.id) ?? selectedTask;
	}, [selectedTask, tasks]);

	return (
		<div className="h-full flex flex-col">
			<TaskDetailModal
				task={liveSelectedTask}
				open={liveSelectedTask !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedTask(null);
				}}
				projectId={projectId}
			/>
			<PanelGroup direction="horizontal" className="flex-1 min-h-0">
				{STATUS_ORDER.map((status, i) => (
					<KanbanColumnPanel
						key={status}
						status={status}
						tasks={grouped.get(status) ?? []}
						projectId={projectId}
						isFirst={i === 0}
						onDropTask={handleDropTask}
						onTaskClick={handleTaskClick}
					/>
				))}
			</PanelGroup>
		</div>
	);
}

// ─── Column ─────────────────────────────────────────────────────────

function KanbanColumnPanel({
	status,
	tasks,
	projectId,
	isFirst,
	onDropTask,
	onTaskClick,
}: {
	status: TaskStatus;
	tasks: Task[];
	projectId: string | null;
	isFirst: boolean;
	onDropTask: (taskId: string, newStatus: string) => void;
	onTaskClick: (task: Task) => void;
}) {
	return (
		<>
			{!isFirst && (
				<PanelResizeHandle className="w-px bg-border hover:bg-primary/30 transition-colors data-[resize-handle-active]:bg-primary/50" />
			)}
			<Panel minSize={12} defaultSize={25}>
				<KanbanColumn
					status={status}
					tasks={tasks}
					projectId={projectId}
					onDropTask={onDropTask}
					onTaskClick={onTaskClick}
				/>
			</Panel>
		</>
	);
}

function KanbanColumn({
	status,
	tasks,
	projectId,
	onDropTask,
	onTaskClick,
}: {
	status: TaskStatus;
	tasks: Task[];
	projectId: string | null;
	onDropTask: (taskId: string, newStatus: string) => void;
	onTaskClick: (task: Task) => void;
}) {
	const config = STATUS_CONFIG[status];
	const [showCreate, setShowCreate] = useState(false);

	const [{ isOver, canDrop }, drop] = useDrop(
		() => ({
			accept: TASK_DND_TYPE,
			canDrop: (item: TaskDragItem) => item.fromStatus !== status,
			drop: (item: TaskDragItem) => onDropTask(item.taskId, status),
			collect: (monitor) => ({
				isOver: monitor.isOver(),
				canDrop: monitor.canDrop(),
			}),
		}),
		[status, onDropTask],
	);

	const dropRef = useRef<HTMLDivElement>(null);
	drop(dropRef);

	return (
		<div
			ref={dropRef}
			className={cn(
				"flex flex-col h-full transition-colors",
				isOver && canDrop && "bg-primary/5",
			)}
		>
			<div className="flex items-center gap-1.5 px-2.5 py-2 shrink-0 border-b border-border">
				<span className={cn("size-2 rounded-full shrink-0", config.dotColor)} />
				<span className={cn("text-[11px] font-medium truncate", config.color)}>
					{config.label}
				</span>
				<span className="text-[10px] text-muted-foreground tabular-nums">
					{tasks.length}
				</span>
				{projectId && (
					<button
						type="button"
						onClick={() => setShowCreate(true)}
						className="ml-auto p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
					>
						<LuPlus className="size-3" />
					</button>
				)}
			</div>
			<div
				className={cn(
					"flex-1 overflow-y-auto p-1.5 space-y-1.5 transition-all",
					isOver && canDrop && "ring-2 ring-inset ring-primary/30 rounded-b-md",
				)}
			>
				{showCreate && projectId && (
					<CreateTaskCard
						projectId={projectId}
						status={status}
						onClose={() => setShowCreate(false)}
					/>
				)}
				{tasks.map((task) => (
					<TaskCard
						key={task.id}
						task={task}
						projectId={projectId}
						onTaskClick={onTaskClick}
					/>
				))}
				{tasks.length === 0 && !showCreate && (
					<div
						className={cn(
							"flex items-center justify-center h-16 rounded-md border border-dashed text-[10px] text-muted-foreground transition-colors",
							isOver && canDrop
								? "border-primary/40 bg-primary/5"
								: "border-border",
						)}
					>
						{isOver && canDrop ? "Drop here" : "No tasks"}
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Create Task ────────────────────────────────────────────────────

function CreateTaskCard({
	projectId,
	status,
	onClose,
}: {
	projectId: string;
	status: string;
	onClose: () => void;
}) {
	const [title, setTitle] = useState("");
	const utils = electronTrpc.useUtils();

	const createMutation = electronTrpc.portal.tasks.create.useMutation({
		onSuccess: () => {
			utils.portal.tasks.list.invalidate({ projectId });
			onClose();
		},
	});

	const handleSubmit = () => {
		const trimmed = title.trim();
		if (!trimmed) return;
		createMutation.mutate({ projectId, title: trimmed, status });
	};

	return (
		<div className="rounded-md border bg-card p-2 space-y-1.5">
			<Input
				autoFocus
				placeholder="Task title..."
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") handleSubmit();
					if (e.key === "Escape") onClose();
				}}
				className="h-7 text-xs"
			/>
			<div className="flex items-center gap-1">
				<Button
					size="sm"
					className="h-6 px-2 text-[10px]"
					disabled={!title.trim() || createMutation.isPending}
					onClick={handleSubmit}
				>
					{createMutation.isPending ? "Creating..." : "Add"}
				</Button>
				<button
					type="button"
					onClick={onClose}
					className="p-1 text-muted-foreground hover:text-foreground transition-colors"
				>
					<LuX className="size-3" />
				</button>
			</div>
			{createMutation.isError && (
				<p className="text-[10px] text-destructive">
					{createMutation.error.message}
				</p>
			)}
		</div>
	);
}

// ─── Task Card ──────────────────────────────────────────────────────

function TaskCard({
	task,
	projectId: _projectId,
	onTaskClick,
}: {
	task: Task;
	projectId: string | null;
	onTaskClick: (task: Task) => void;
}) {
	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: TASK_DND_TYPE,
			item: { taskId: task.id, fromStatus: task.status } as TaskDragItem,
			collect: (monitor) => ({ isDragging: monitor.isDragging() }),
		}),
		[task.id, task.status],
	);

	const cardRef = useRef<HTMLDivElement>(null);
	drag(cardRef);

	const priorityStyle = task.priority
		? (PRIORITY_STYLES[task.priority] ?? "")
		: "";
	const commentCount = task._count?.comments ?? 0;

	return (
		<div
			ref={cardRef}
			className={cn(
				"group/card rounded-md border bg-card text-card-foreground transition-all cursor-grab active:cursor-grabbing hover:bg-accent/30",
				isDragging && "opacity-40 scale-[0.97]",
			)}
		>
			<button
				type="button"
				onClick={() => onTaskClick(task)}
				className="w-full text-left p-2 min-w-0 flex items-start gap-1"
			>
				<LuGripVertical className="size-3 mt-0.5 shrink-0 text-muted-foreground opacity-0 group-hover/card:opacity-100 transition-opacity" />
				<div className="flex-1 min-w-0">
					<h3 className="text-xs font-medium leading-snug line-clamp-2">
						{task.title}
					</h3>

					{task.description && (
						<p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
							{task.description.replace(/[#*_`~[\]]/g, "")}
						</p>
					)}

					<div className="flex items-center gap-1 mt-1.5 flex-wrap">
						{task.priority && (
							<span
								className={cn(
									"text-[9px] px-1 py-px rounded font-medium",
									priorityStyle,
								)}
							>
								{task.priority}
							</span>
						)}
						{task.labels?.map((label) => (
							<span
								key={label.id}
								className="text-[9px] px-1 py-px rounded font-medium"
								style={{
									backgroundColor: `${label.color}20`,
									color: label.color,
								}}
							>
								{label.name}
							</span>
						))}
						{commentCount > 0 && (
							<span className="flex items-center gap-0.5 text-[9px] text-muted-foreground ml-auto">
								<LuMessageSquare className="size-2.5" />
								{commentCount}
							</span>
						)}
					</div>

					{task.assignee && (
						<div className="text-[10px] text-muted-foreground mt-1">
							{task.assignee.name}
						</div>
					)}
				</div>
			</button>
		</div>
	);
}

// ─── Draggable hook ─────────────────────────────────────────────────

function useDraggable() {
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const dragState = useRef<{
		startX: number;
		startY: number;
		origX: number;
		origY: number;
	} | null>(null);

	const reset = useCallback(() => setPosition({ x: 0, y: 0 }), []);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			// only left-click on the handle itself
			if (e.button !== 0) return;
			dragState.current = {
				startX: e.clientX,
				startY: e.clientY,
				origX: position.x,
				origY: position.y,
			};
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
		},
		[position],
	);

	const onPointerMove = useCallback((e: React.PointerEvent) => {
		const ds = dragState.current;
		if (!ds) return;
		setPosition({
			x: ds.origX + (e.clientX - ds.startX),
			y: ds.origY + (e.clientY - ds.startY),
		});
	}, []);

	const onPointerUp = useCallback(() => {
		dragState.current = null;
	}, []);

	return {
		position,
		reset,
		handlers: { onPointerDown, onPointerMove, onPointerUp },
	};
}

// ─── Task Detail Modal ──────────────────────────────────────────────

function TaskDetailModal({
	task,
	open,
	onOpenChange,
	projectId,
}: {
	task: Task | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string | null;
}) {
	const utils = electronTrpc.useUtils();
	const queryKey = projectId ? { projectId } : undefined;
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [titleDraft, setTitleDraft] = useState("");
	const [isEditingDesc, setIsEditingDesc] = useState(false);
	const [descDraft, setDescDraft] = useState("");
	const titleInputRef = useRef<HTMLInputElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const {
		position,
		reset: resetPosition,
		handlers: dragHandlers,
	} = useDraggable();

	// Reset position when modal opens
	useEffect(() => {
		if (open) resetPosition();
	}, [open, resetPosition]);

	// Global ESC handler
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				// Don't close if we're editing something — just blur/cancel the edit
				if (isEditingTitle) {
					setIsEditingTitle(false);
					return;
				}
				if (isEditingDesc) {
					setIsEditingDesc(false);
					return;
				}
				onOpenChange(false);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open, onOpenChange, isEditingTitle, isEditingDesc]);

	const updateMutation = electronTrpc.portal.tasks.update.useMutation({
		onMutate: async (vars) => {
			try {
				await utils.portal.tasks.list.cancel(queryKey);
			} catch {}
			const previous = utils.portal.tasks.list.getData(queryKey);
			if (Array.isArray(previous)) {
				const updated = previous.map((t: unknown) => {
					const existing = t as Record<string, unknown>;
					if (existing.id !== vars.taskId) return existing;
					const patch: Record<string, unknown> = {};
					if (vars.status) patch.status = vars.status;
					if (vars.title !== undefined) patch.title = vars.title;
					if (vars.description !== undefined)
						patch.description = vars.description;
					return { ...existing, ...patch };
				});
				utils.portal.tasks.list.setData(queryKey, updated as typeof previous);
			}
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				utils.portal.tasks.list.setData(
					queryKey,
					context.previous as typeof context.previous,
				);
			}
		},
		onSettled: () => {
			if (projectId) utils.portal.tasks.list.invalidate({ projectId });
		},
	});

	if (!task) return null;

	const statusConfig = STATUS_CONFIG[(task.status as TaskStatus) ?? "TODO"];
	const priorityStyle = task.priority
		? (PRIORITY_STYLES[task.priority] ?? "")
		: "";

	const handleStartEditTitle = () => {
		setTitleDraft(task.title);
		setIsEditingTitle(true);
		setTimeout(() => titleInputRef.current?.focus(), 0);
	};

	const handleSaveTitle = () => {
		const trimmed = titleDraft.trim();
		if (trimmed && trimmed !== task.title) {
			updateMutation.mutate({ taskId: task.id, title: trimmed });
		}
		setIsEditingTitle(false);
	};

	const handleStartEditDesc = () => {
		setDescDraft(task.description ?? "");
		setIsEditingDesc(true);
	};

	const handleSaveDesc = () => {
		updateMutation.mutate({ taskId: task.id, description: descDraft });
		setIsEditingDesc(false);
	};

	const handleStatusChange = (newStatus: string) => {
		updateMutation.mutate({ taskId: task.id, status: newStatus });
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal={false}>
			<DialogPortal>
				<DialogOverlay className="bg-black/20 backdrop-blur-[3px]" />
				{/* biome-ignore lint/a11y/noStaticElementInteractions: overlay dismiss */}
				<div
					className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
					onClick={() => onOpenChange(false)}
					onKeyDown={(e) => {
						if (e.key === "Escape") onOpenChange(false);
					}}
				>
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
					<div
						ref={panelRef}
						role="dialog"
						aria-modal="true"
						style={{
							transform: `translate(${position.x}px, ${position.y}px)`,
						}}
						className={cn(
							"relative flex max-h-[min(72vh,600px)] w-full flex-col overflow-hidden rounded-2xl",
							"border border-white/[0.08] bg-card/60 backdrop-blur-2xl backdrop-saturate-150",
							"shadow-[0_8px_40px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.04)_inset]",
							"text-foreground sm:max-w-[560px]",
						)}
						onClick={(e) => e.stopPropagation()}
					>
						<DialogTitle className="sr-only">{task.title}</DialogTitle>
						<DialogDescription className="sr-only">
							Task detail view
						</DialogDescription>

						{/* Drag handle / Header */}
						<div
							className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2 shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
							{...dragHandlers}
						>
							<div className="flex items-center gap-2 min-w-0 pointer-events-none">
								<span
									className={cn(
										"size-2 rounded-full shrink-0",
										statusConfig.dotColor,
									)}
								/>
								<span className={cn("text-xs font-medium", statusConfig.color)}>
									{statusConfig.label}
								</span>
							</div>
							<button
								type="button"
								onClick={() => onOpenChange(false)}
								className="pointer-events-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
								aria-label="Close"
							>
								<HiXMark className="size-4" />
							</button>
						</div>

						{/* Body - scrollable */}
						<ScrollArea className="flex-1 min-h-0">
							<div className="px-5 py-4 space-y-4">
								{/* Title */}
								{isEditingTitle ? (
									<input
										ref={titleInputRef}
										type="text"
										value={titleDraft}
										onChange={(e) => setTitleDraft(e.target.value)}
										onBlur={handleSaveTitle}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												handleSaveTitle();
											}
											if (e.key === "Escape") {
												e.stopPropagation();
												setIsEditingTitle(false);
											}
										}}
										className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground/60"
										placeholder="Task title..."
									/>
								) : (
									<button
										type="button"
										onClick={handleStartEditTitle}
										className="w-full text-left group/title"
									>
										<h2 className="text-lg font-semibold leading-snug group-hover/title:text-foreground/80 transition-colors">
											{task.title}
										</h2>
									</button>
								)}

								{/* Meta row */}
								<div className="flex items-center gap-2 flex-wrap">
									{task.priority && (
										<span
											className={cn(
												"text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-white/[0.06]",
												priorityStyle,
											)}
										>
											{task.priority}
										</span>
									)}
									{task.labels?.map((label) => (
										<span
											key={label.id}
											className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
											style={{
												backgroundColor: `${label.color}18`,
												color: label.color,
											}}
										>
											{label.name}
										</span>
									))}
									{task.assignee && (
										<span className="text-xs text-muted-foreground">
											{task.assignee.name}
										</span>
									)}
									{task.dueDate && (
										<span className="text-xs text-muted-foreground">
											Due {new Date(task.dueDate).toLocaleDateString()}
										</span>
									)}
								</div>

								{/* Description */}
								<div className="border-t border-white/[0.06] pt-4">
									{isEditingDesc ? (
										<div className="space-y-2">
											<Textarea
												autoFocus
												value={descDraft}
												onChange={(e) => setDescDraft(e.target.value)}
												placeholder="Task description (markdown)..."
												className="text-sm min-h-[120px] resize-y bg-white/[0.04] border-white/[0.08]"
												onKeyDown={(e) => {
													if (e.key === "Escape") {
														e.stopPropagation();
														setIsEditingDesc(false);
													}
												}}
											/>
											<div className="flex items-center gap-2">
												<Button
													size="sm"
													className="h-7 px-3 text-xs"
													disabled={updateMutation.isPending}
													onClick={handleSaveDesc}
												>
													{updateMutation.isPending ? "Saving..." : "Save"}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													className="h-7 px-3 text-xs text-muted-foreground"
													onClick={() => setIsEditingDesc(false)}
												>
													Cancel
												</Button>
											</div>
										</div>
									) : (
										<div className="group/desc relative">
											{task.description ? (
												<div className="portal-task-markdown text-sm leading-relaxed text-foreground/90">
													<ReactMarkdown remarkPlugins={[remarkGfm]}>
														{task.description}
													</ReactMarkdown>
												</div>
											) : (
												<p className="text-sm text-muted-foreground italic">
													No description
												</p>
											)}
											<button
												type="button"
												onClick={handleStartEditDesc}
												className="absolute top-0 right-0 p-1 rounded opacity-0 group-hover/desc:opacity-100 hover:bg-white/10 transition-all text-muted-foreground hover:text-foreground"
											>
												<LuPencil className="size-3.5" />
											</button>
										</div>
									)}
								</div>

								{/* Status controls */}
								<div className="border-t border-white/[0.06] pt-4">
									<span className="text-xs text-muted-foreground mb-2 block">
										Status
									</span>
									<div className="flex flex-wrap gap-1.5">
										{STATUS_ORDER.map((s) => {
											const cfg = STATUS_CONFIG[s];
											const isActive = task.status === s;
											return (
												<Button
													key={s}
													variant={isActive ? "default" : "ghost"}
													size="sm"
													className={cn(
														"h-7 px-2.5 text-xs border",
														isActive
															? "border-transparent"
															: "border-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.06]",
													)}
													disabled={isActive || updateMutation.isPending}
													onClick={() => handleStatusChange(s)}
												>
													<span
														className={cn(
															"size-1.5 rounded-full mr-1.5",
															cfg.dotColor,
														)}
													/>
													{cfg.label}
												</Button>
											);
										})}
									</div>
								</div>
							</div>
						</ScrollArea>
					</div>
				</div>
			</DialogPortal>
		</Dialog>
	);
}
