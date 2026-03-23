import { Alerter } from "@superset/ui/atoms/Alert";
import type { ReactNode } from "react";
import { ThemedToaster } from "renderer/components/ThemedToaster";
import { AuthProvider } from "renderer/providers/AuthProvider";
import { ElectronTRPCProvider } from "renderer/providers/ElectronTRPCProvider";
import { StudioModeProvider } from "renderer/providers/StudioModeProvider";

export function RootLayout({ children }: { children: ReactNode }) {
	return (
		<ElectronTRPCProvider>
			<StudioModeProvider>
				<AuthProvider>
					{children}
					<ThemedToaster />
					<Alerter />
				</AuthProvider>
			</StudioModeProvider>
		</ElectronTRPCProvider>
	);
}
