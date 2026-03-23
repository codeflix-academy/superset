import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface StudioLoginOverlayProps {
	onSuccess: () => void;
}

export function StudioLoginOverlay({ onSuccess }: StudioLoginOverlayProps) {
	const [step, setStep] = useState<"email" | "otp">("email");
	const [email, setEmail] = useState("");
	const [otpCode, setOtpCode] = useState("");
	const [error, setError] = useState<string | null>(null);

	const sendOtpMutation = electronTrpc.studioAuth.sendOtp.useMutation({
		onSuccess: () => {
			setStep("otp");
			setError(null);
		},
		onError: (err) => {
			setError(err.message);
		},
	});

	const verifyOtpMutation = electronTrpc.studioAuth.verifyOtp.useMutation({
		onSuccess: () => {
			onSuccess();
		},
		onError: (err) => {
			setError(err.message);
		},
	});

	function handleSendOtp(e: React.FormEvent) {
		e.preventDefault();
		if (!email.trim()) return;
		setError(null);
		sendOtpMutation.mutate({ email: email.trim() });
	}

	function handleVerifyOtp(e: React.FormEvent) {
		e.preventDefault();
		if (!otpCode.trim()) return;
		setError(null);
		verifyOtpMutation.mutate({ email, token: otpCode.trim() });
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
			<div className="w-full max-w-sm p-8 space-y-6">
				<div className="text-center space-y-2">
					<h1 className="text-2xl font-bold">Studio Desktop</h1>
					<p className="text-sm text-muted-foreground">
						Sign in with your portal email to continue
					</p>
				</div>

				{step === "email" ? (
					<form onSubmit={handleSendOtp} className="space-y-4">
						<div className="space-y-2">
							<label htmlFor="studio-email" className="text-sm font-medium">
								Email
							</label>
							<Input
								id="studio-email"
								type="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								autoFocus
							/>
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}

						<Button
							type="submit"
							className="w-full"
							disabled={sendOtpMutation.isPending || !email.trim()}
						>
							{sendOtpMutation.isPending
								? "Sending code..."
								: "Send verification code"}
						</Button>
					</form>
				) : (
					<form onSubmit={handleVerifyOtp} className="space-y-4">
						<div className="space-y-2">
							<label htmlFor="studio-otp" className="text-sm font-medium">
								Verification code
							</label>
							<Input
								id="studio-otp"
								type="text"
								placeholder="Enter 6-digit code"
								value={otpCode}
								onChange={(e) => setOtpCode(e.target.value)}
								autoFocus
							/>
							<p className="text-xs text-muted-foreground">
								We sent a code to {email}
							</p>
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}

						<Button
							type="submit"
							className="w-full"
							disabled={verifyOtpMutation.isPending || !otpCode.trim()}
						>
							{verifyOtpMutation.isPending
								? "Verifying..."
								: "Verify & sign in"}
						</Button>

						<button
							type="button"
							onClick={() => {
								setStep("email");
								setOtpCode("");
								setError(null);
							}}
							className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							Use a different email
						</button>
					</form>
				)}
			</div>
		</div>
	);
}
