import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { env } from "renderer/env.renderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { StudioUserBadge } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/StudioUserBadge";
import { StudioSessionCapture } from "renderer/screens/main/components/StudioSessionCapture";
import { StudioLoginOverlay } from "./components/StudioLoginOverlay";

interface StudioModeContextValue {
	isStudioMode: boolean;
	isAuthenticated: boolean;
	user: { id: string; email: string } | null;
}

const StudioModeContext = createContext<StudioModeContextValue>({
	isStudioMode: false,
	isAuthenticated: false,
	user: null,
});

export function useStudioMode() {
	return useContext(StudioModeContext);
}

interface StudioModeProviderProps {
	children: ReactNode;
}

export function StudioModeProvider({ children }: StudioModeProviderProps) {
	if (!env.STUDIO_MODE) {
		return <>{children}</>;
	}

	return <StudioModeInner>{children}</StudioModeInner>;
}

function StudioModeInner({ children }: { children: ReactNode }) {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [user, setUser] = useState<{ id: string; email: string } | null>(null);

	const sessionQuery = electronTrpc.studioAuth.getStoredSession.useQuery(
		undefined,
		{
			retry: false,
		},
	);

	const refreshMutation = electronTrpc.studioAuth.refreshSession.useMutation();

	// Hydrate from stored session
	useEffect(() => {
		if (sessionQuery.data) {
			setIsAuthenticated(true);
			setUser(sessionQuery.data.user);
		} else if (sessionQuery.data === null) {
			setIsAuthenticated(false);
			setUser(null);
		}
	}, [sessionQuery.data]);

	// Subscribe to session changes
	electronTrpc.studioAuth.onSessionChanged.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "changed" && event.user) {
				setIsAuthenticated(true);
				setUser(event.user);
			} else if (event.type === "cleared") {
				setIsAuthenticated(false);
				setUser(null);
			}
		},
	});

	// Periodic token refresh (every 10 minutes)
	useEffect(() => {
		if (!isAuthenticated) return;

		const interval = setInterval(
			() => {
				refreshMutation.mutate();
			},
			10 * 60 * 1000,
		);

		return () => clearInterval(interval);
	}, [isAuthenticated, refreshMutation]);

	const handleLoginSuccess = useCallback(() => {
		sessionQuery.refetch();
	}, [sessionQuery]);

	const value = useMemo(
		() => ({
			isStudioMode: true,
			isAuthenticated,
			user,
		}),
		[isAuthenticated, user],
	);

	return (
		<StudioModeContext.Provider value={value}>
			{!isAuthenticated && !sessionQuery.isLoading && (
				<StudioLoginOverlay onSuccess={handleLoginSuccess} />
			)}
			{children}
			<StudioUserBadge />
			<StudioSessionCapture />
		</StudioModeContext.Provider>
	);
}
