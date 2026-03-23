import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_dashboard/portal-tasks")(
	{
		component: PortalTasksLayout,
	},
);

function PortalTasksLayout() {
	return <Outlet />;
}
