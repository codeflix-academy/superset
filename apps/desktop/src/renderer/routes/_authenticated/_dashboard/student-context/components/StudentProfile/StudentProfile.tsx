import { Card, CardContent } from "@superset/ui/card";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface StudentContext {
	profile?: {
		name: string;
		email: string;
		summary?: string;
	};
}

export function StudentProfile() {
	const { data, isLoading, error } = electronTrpc.portal.context.get.useQuery();

	if (isLoading) {
		return <div className="h-32 rounded-lg bg-muted animate-pulse" />;
	}

	if (error) {
		return (
			<div className="text-sm text-destructive">
				Failed to load profile: {error.message}
			</div>
		);
	}

	const context = data as StudentContext | undefined;
	const profile = context?.profile;

	if (!profile) {
		return null;
	}

	return (
		<div>
			<h3 className="text-sm font-medium mb-3">Profile</h3>
			<Card>
				<CardContent>
					<div className="space-y-3">
						<div>
							<div className="text-sm font-medium">{profile.name}</div>
							<div className="text-xs text-muted-foreground">
								{profile.email}
							</div>
						</div>
						{profile.summary && (
							<p className="text-sm text-muted-foreground">{profile.summary}</p>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
