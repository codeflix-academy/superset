import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiOutlineArrowUpTray } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStudioActiveProjectId } from "renderer/stores/studio-state";

export function UploadSessionButton() {
	const [isUploading, setIsUploading] = useState(false);
	const projectId = useStudioActiveProjectId();
	const ingestMutation = electronTrpc.portal.sessions.ingest.useMutation({
		onSuccess: () => {
			toast.success("Session uploaded successfully");
			setIsUploading(false);
		},
		onError: (err) => {
			toast.error(`Upload failed: ${err.message}`);
			setIsUploading(false);
		},
	});

	async function handleUpload() {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}

		setIsUploading(true);
		ingestMutation.mutate({
			projectId,
			branchName: "manual-upload",
			transcript: JSON.stringify({
				type: "manual",
				timestamp: new Date().toISOString(),
			}),
		});
	}

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={handleUpload}
			disabled={isUploading || !projectId}
		>
			<HiOutlineArrowUpTray className="h-4 w-4 mr-1.5" />
			{isUploading ? "Uploading..." : "Upload Session"}
		</Button>
	);
}
