import { CheckCircle2, CircleAlert, TriangleAlert } from "lucide-react";
import type { ToastPayload } from "@/shared/rpc";

interface ToastBannerProps {
	toast: ToastPayload;
}

export function ToastBanner({ toast }: ToastBannerProps) {
	const icon =
		toast.type === "error" ? (
			<CircleAlert className="toast-icon error" />
		) : toast.type === "warning" ? (
			<TriangleAlert className="toast-icon warning" />
		) : (
			<CheckCircle2 className="toast-icon success" />
		);

	return (
		<div className="toast-banner">
			{icon}
			<div>
				<p className="toast-title">{toast.title}</p>
				<p className="toast-message">{toast.message}</p>
			</div>
		</div>
	);
}
