import { Card, CardContent } from "@superset/ui/card";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface Interest {
	name: string;
	category?: string;
}

interface StudentContext {
	interests?: Interest[];
}

export function InterestsList() {
	const { data, isLoading } = electronTrpc.portal.context.get.useQuery();

	if (isLoading) {
		return <div className="h-20 rounded-lg bg-muted animate-pulse" />;
	}

	const context = data as StudentContext | undefined;
	const interests = context?.interests;

	if (!interests || interests.length === 0) {
		return null;
	}

	return (
		<div>
			<h3 className="text-sm font-medium mb-3">Interests</h3>
			<Card>
				<CardContent>
					<div className="flex flex-wrap gap-2">
						{interests.map((interest) => (
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
				</CardContent>
			</Card>
		</div>
	);
}
