import { CheckCircle2, CircleAlert, TriangleAlert } from "lucide-react";
import type { ToastPayload } from "@/shared/rpc";

interface ToastBannerProps {
	toast: ToastPayload;
}

export function ToastBanner({ toast }: ToastBannerProps) {
	const icon =
		toast.type === "error" ? (
			<CircleAlert className="h-4 w-4 text-rose-600" />
		) : toast.type === "warning" ? (
			<TriangleAlert className="h-4 w-4 text-amber-600" />
		) : (
			<CheckCircle2 className="h-4 w-4 text-emerald-600" />
		);

	return (
		<div className="toast-banner">
			{icon}
			<div>
				<p className="text-sm font-semibold">{toast.title}</p>
				<p className="text-xs text-muted-foreground">{toast.message}</p>
			</div>
		</div>
	);
}
