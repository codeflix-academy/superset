import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createAnalyticsRouter = () => {
	return router({
		setUserId: publicProcedure
			.input(z.object({ userId: z.string().nullable() }))
			.mutation(({ input: _input }) => {
				// Analytics removed - no-op
			}),
	});
};

export type AnalyticsRouter = ReturnType<typeof createAnalyticsRouter>;
