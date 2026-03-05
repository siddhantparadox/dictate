import { type HTMLAttributes, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

export type WaveformProps = HTMLAttributes<HTMLDivElement> & {
	data?: number[];
	barWidth?: number;
	barHeight?: number;
	barGap?: number;
	barRadius?: number;
	barColor?: string;
	fadeEdges?: boolean;
	fadeWidth?: number;
	height?: string | number;
};

function clampUnit(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	if (value <= 0) {
		return 0;
	}
	if (value >= 1) {
		return 1;
	}
	return value;
}

function normalizeData(data: number[]): number[] {
	if (!Array.isArray(data) || data.length === 0) {
		return [0];
	}
	return data.map((value) => clampUnit(value));
}

export function Waveform({
	data = [],
	barWidth = 4,
	barHeight = 4,
	barGap = 2,
	barRadius = 2,
	barColor,
	fadeEdges = true,
	fadeWidth = 24,
	height = 128,
	className,
	...props
}: WaveformProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const normalizedData = useMemo(() => normalizeData(data), [data]);
	const heightStyle = typeof height === "number" ? `${height}px` : height;

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) {
			return;
		}

		const context = canvas.getContext("2d");
		if (!context) {
			return;
		}

		const draw = () => {
			const rect = container.getBoundingClientRect();
			const width = Math.max(1, Math.floor(rect.width));
			const heightPx = Math.max(1, Math.floor(rect.height));
			const dpr = window.devicePixelRatio || 1;

			canvas.width = Math.floor(width * dpr);
			canvas.height = Math.floor(heightPx * dpr);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${heightPx}px`;

			context.setTransform(1, 0, 0, 1, 0, 0);
			context.scale(dpr, dpr);
			context.clearRect(0, 0, width, heightPx);

			const computedForeground = getComputedStyle(canvas)
				.getPropertyValue("--foreground")
				.trim();
			const color = barColor || computedForeground || "hsl(var(--primary))";
			const barStride = barWidth + barGap;
			const barsToDraw = Math.max(1, Math.floor((width + barGap) / barStride));
			const maxIndex = normalizedData.length - 1;
			const centerY = heightPx / 2;

			for (let bar = 0; bar < barsToDraw; bar++) {
				const ratio = barsToDraw <= 1 ? 0 : bar / (barsToDraw - 1);
				const dataIndex = Math.round(ratio * maxIndex);
				const value = normalizedData[dataIndex] ?? 0;
				const currentBarHeight = Math.max(barHeight, value * heightPx * 0.85);
				const x = bar * barStride;
				const y = centerY - currentBarHeight / 2;

				context.fillStyle = color;
				context.globalAlpha = 0.22 + value * 0.78;
				if (barRadius > 0) {
					context.beginPath();
					context.roundRect(x, y, barWidth, currentBarHeight, barRadius);
					context.fill();
				} else {
					context.fillRect(x, y, barWidth, currentBarHeight);
				}
			}

			if (fadeEdges && fadeWidth > 0 && width > 0) {
				const fadeRatio = Math.min(0.45, fadeWidth / width);
				const maskGradient = context.createLinearGradient(0, 0, width, 0);
				maskGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
				maskGradient.addColorStop(fadeRatio, "rgba(255, 255, 255, 1)");
				maskGradient.addColorStop(1 - fadeRatio, "rgba(255, 255, 255, 1)");
				maskGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
				context.globalCompositeOperation = "destination-in";
				context.fillStyle = maskGradient;
				context.fillRect(0, 0, width, heightPx);
				context.globalCompositeOperation = "source-over";
			}

			context.globalAlpha = 1;
		};

		const resizeObserver = new ResizeObserver(() => {
			draw();
		});
		resizeObserver.observe(container);
		draw();

		return () => {
			resizeObserver.disconnect();
		};
	}, [
		barColor,
		barGap,
		barHeight,
		barRadius,
		barWidth,
		fadeEdges,
		fadeWidth,
		normalizedData,
	]);

	return (
		<div
			{...props}
			className={cn("relative", className)}
			ref={containerRef}
			style={{ height: heightStyle }}
		>
			<canvas className="block h-full w-full" ref={canvasRef} />
		</div>
	);
}
