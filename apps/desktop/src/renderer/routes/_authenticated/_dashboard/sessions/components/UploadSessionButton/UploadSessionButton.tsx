import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { HiOutlineArrowUpTray } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioActiveProjectId } from "renderer/stores/studio-state";

export function UploadSessionButton() {
	const projectId = useStudioActiveProjectId();
	const uploadMutation =
		electronTrpc.portal.sessions.uploadFromFilePicker.useMutation({
			onSuccess: (result) => {
				if (result.status === "canceled") return;
				toast.success(
					`Uploaded ${result.messageCount ?? "?"} messages from ${result.source}`,
				);
			},
			onError: (err) => {
				toast.error(`Upload failed: ${err.message}`);
			},
		});

	function handleUpload() {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}
		uploadMutation.mutate({ projectId });
	}

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={handleUpload}
			disabled={uploadMutation.isPending || !projectId}
		>
			<HiOutlineArrowUpTray className="h-4 w-4 mr-1.5" />
			{uploadMutation.isPending ? "Uploading..." : "Upload Session"}
		</Button>
	);
}
