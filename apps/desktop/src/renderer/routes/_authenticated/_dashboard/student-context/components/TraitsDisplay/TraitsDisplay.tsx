import { Card, CardContent } from "@superset/ui/card";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface Trait {
	name: string;
	score: number;
	description?: string;
}

interface StudentContext {
	traits?: Trait[];
}

export function TraitsDisplay() {
	const { data, isLoading } = electronTrpc.portal.context.get.useQuery();

	if (isLoading) {
		return <div className="h-24 rounded-lg bg-muted animate-pulse" />;
	}

	const context = data as StudentContext | undefined;
	const traits = context?.traits;

	if (!traits || traits.length === 0) {
		return null;
	}

	return (
		<div>
			<h3 className="text-sm font-medium mb-3">Traits</h3>
			<div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
				{traits.map((trait) => (
					<Card key={trait.name}>
						<CardContent>
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
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
