import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { MOCK_ORG_ID } from "shared/constants";
import {
	type AppCollections,
	getCollections,
	getDisabledCollections,
	preloadCollections,
} from "./collections";

type CollectionsContextType = AppCollections & {
	switchOrganization: (organizationId: string) => Promise<void>;
};

const CollectionsContext = createContext<CollectionsContextType | null>(null);

export function preloadActiveOrganizationCollections(
	activeOrganizationId: string | null | undefined,
): void {
	if (!activeOrganizationId) return;
	void preloadCollections(activeOrganizationId).catch((error) => {
		console.error(
			"[collections-provider] Failed to preload active org collections:",
			error,
		);
	});
}

export function CollectionsProvider({ children }: { children: ReactNode }) {
	// Studio mode: skip Electric sync entirely — provide empty local-only collections
	if (env.STUDIO_MODE) {
		return <StudioCollectionsProvider>{children}</StudioCollectionsProvider>;
	}

	return <SaaSCollectionsProvider>{children}</SaaSCollectionsProvider>;
}

function StudioCollectionsProvider({ children }: { children: ReactNode }) {
	const noopSwitch = useCallback(async () => {}, []);
	const collections = getDisabledCollections(MOCK_ORG_ID);

	return (
		<CollectionsContext.Provider
			value={{ ...collections, switchOrganization: noopSwitch }}
		>
			{children}
		</CollectionsContext.Provider>
	);
}

function SaaSCollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const [isSwitching, setIsSwitching] = useState(false);
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	const switchOrganization = useCallback(
		async (organizationId: string) => {
			if (organizationId === activeOrganizationId) return;
			setIsSwitching(true);
			try {
				await authClient.organization.setActive({ organizationId });
				await preloadCollections(organizationId);
				await refetchSession();
			} finally {
				setIsSwitching(false);
			}
		},
		[activeOrganizationId, refetchSession],
	);

	useEffect(() => {
		preloadActiveOrganizationCollections(activeOrganizationId);
	}, [activeOrganizationId]);

	const collections = activeOrganizationId
		? getCollections(activeOrganizationId)
		: null;

	if (!collections || isSwitching) {
		return null;
	}

	return (
		<CollectionsContext.Provider value={{ ...collections, switchOrganization }}>
			{children}
		</CollectionsContext.Provider>
	);
}

export function useCollections(): CollectionsContextType {
	const context = useContext(CollectionsContext);
	if (!context) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	return context;
}
