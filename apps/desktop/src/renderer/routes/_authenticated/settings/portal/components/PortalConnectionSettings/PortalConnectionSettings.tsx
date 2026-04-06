import { Button } from "@superset/ui/button";
import { Card, CardContent } from "@superset/ui/card";
import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioMode } from "renderer/providers/StudioModeProvider";

export function PortalConnectionSettings() {
	const { isAuthenticated, user } = useStudioMode();

	const { data: connectionStatus } =
		electronTrpc.portal.connection.status.useQuery();
	const signOutMutation = electronTrpc.studioAuth.signOut.useMutation({
		onSuccess: () => toast.success("Signed out from portal"),
	});

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Portal</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Manage your venture studio portal connection. Portal projects are now
					linked per-project in Project Settings.
				</p>
			</div>

			<div className="space-y-8">
				{/* Connection Status */}
				<div>
					<h3 className="text-sm font-medium mb-4">Connection</h3>
					<Card>
						<CardContent>
							<ul className="space-y-4">
								<li className="flex items-center justify-between gap-8">
									<div className="text-sm font-medium">Status</div>
									<div className="flex items-center gap-2">
										<div
											className={`w-2 h-2 rounded-full ${isAuthenticated ? "bg-green-500" : "bg-muted-foreground"}`}
										/>
										<span className="text-sm text-muted-foreground">
											{isAuthenticated ? "Connected" : "Not connected"}
										</span>
									</div>
								</li>

								{connectionStatus?.portalUrl && (
									<li className="flex items-center justify-between gap-8 pt-4 border-t">
										<div className="text-sm font-medium">Portal URL</div>
										<span className="text-sm text-muted-foreground font-mono">
											{connectionStatus.portalUrl}
										</span>
									</li>
								)}

								{user && (
									<li className="flex items-center justify-between gap-8 pt-4 border-t">
										<div className="text-sm font-medium">Email</div>
										<span className="text-sm text-muted-foreground">
											{user.email}
										</span>
									</li>
								)}
							</ul>
						</CardContent>
					</Card>
				</div>

				{/* Sign Out */}
				{isAuthenticated && (
					<div className="pt-6 border-t">
						<h3 className="text-sm font-medium mb-2">Sign Out</h3>
						<p className="text-sm text-muted-foreground mb-4">
							Sign out from the venture studio portal.
						</p>
						<Button variant="outline" onClick={() => signOutMutation.mutate()}>
							Sign Out from Portal
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
