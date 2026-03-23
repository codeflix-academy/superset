import { electronTrpc } from "renderer/lib/electron-trpc";

interface StudentContext {
	profile?: {
		name: string;
		email: string;
		summary?: string;
	};
	traits?: Array<{
		name: string;
		score: number;
		description?: string;
	}>;
	interests?: Array<{
		name: string;
		category?: string;
	}>;
}

export function PortalContextView() {
	const { data, isLoading, error } = electronTrpc.portal.context.get.useQuery();

	if (isLoading) {
		return (
			<div className="space-y-4 p-4">
				<div className="h-32 rounded-lg bg-muted animate-pulse" />
				<div className="h-24 rounded-lg bg-muted animate-pulse" />
				<div className="h-20 rounded-lg bg-muted animate-pulse" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-4 text-sm text-destructive">
				Failed to load context: {error.message}
			</div>
		);
	}

	const context = data as StudentContext | undefined;

	return (
		<div className="space-y-6 p-4">
			{context?.profile && (
				<div>
					<h3 className="text-sm font-medium mb-3">Profile</h3>
					<div className="p-4 rounded-lg border bg-card space-y-3">
						<div>
							<div className="text-sm font-medium">{context.profile.name}</div>
							<div className="text-xs text-muted-foreground">
								{context.profile.email}
							</div>
						</div>
						{context.profile.summary && (
							<p className="text-sm text-muted-foreground">
								{context.profile.summary}
							</p>
						)}
					</div>
				</div>
			)}

			{context?.traits && context.traits.length > 0 && (
				<div>
					<h3 className="text-sm font-medium mb-3">Traits</h3>
					<div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
						{context.traits.map((trait) => (
							<div key={trait.name} className="p-4 rounded-lg border bg-card">
								<div className="flex items-center justify-between mb-1">
									<span className="text-sm font-medium">{trait.name}</span>
									<span className="text-xs text-muted-foreground">
										{trait.score}/10
									</span>
								</div>
								<div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
									<div
										className="h-full bg-primary rounded-full transition-all"
										style={{ width: `${(trait.score / 10) * 100}%` }}
									/>
								</div>
								{trait.description && (
									<p className="text-xs text-muted-foreground mt-1.5">
										{trait.description}
									</p>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{context?.interests && context.interests.length > 0 && (
				<div>
					<h3 className="text-sm font-medium mb-3">Interests</h3>
					<div className="p-4 rounded-lg border bg-card">
						<div className="flex flex-wrap gap-2">
							{context.interests.map((interest) => (
								<span
									key={interest.name}
									className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
								>
									{interest.name}
									{interest.category && (
										<span className="ml-1 text-muted-foreground">
											· {interest.category}
										</span>
									)}
								</span>
							))}
						</div>
					</div>
				</div>
			)}

			{!context?.profile &&
				!context?.traits?.length &&
				!context?.interests?.length && (
					<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
						No context available
					</div>
				)}
		</div>
	);
}
