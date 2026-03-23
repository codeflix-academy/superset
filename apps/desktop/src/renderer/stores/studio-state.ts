import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface StudioState {
	activeProjectId: string | null;
	setActiveProject: (id: string | null) => void;
}

export const useStudioStore = create<StudioState>()(
	devtools(
		persist(
			(set) => ({
				activeProjectId: null,
				setActiveProject: (id) => set({ activeProjectId: id }),
			}),
			{ name: "studio-state" },
		),
		{ name: "StudioStore" },
	),
);

export const useStudioActiveProjectId = () =>
	useStudioStore((state) => state.activeProjectId);
export const useSetStudioActiveProject = () =>
	useStudioStore((state) => state.setActiveProject);
