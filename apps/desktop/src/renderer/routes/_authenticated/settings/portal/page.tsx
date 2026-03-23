import { createFileRoute } from "@tanstack/react-router";
import { PortalConnectionSettings } from "./components/PortalConnectionSettings";

export const Route = createFileRoute("/_authenticated/settings/portal/")({
	component: PortalSettingsPage,
});

function PortalSettingsPage() {
	return <PortalConnectionSettings />;
}
