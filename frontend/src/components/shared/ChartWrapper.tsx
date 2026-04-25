import { useEffect, useRef, useState, type ReactElement } from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/src/utils/cn";

interface ChartWrapperProps {
  children: ReactElement;
  loading: boolean;
  hasData: boolean;
  className?: string;
  loadingMessage?: string;
  emptyMessage?: string;
  emptyStateClassName?: string;
  minWidth?: number;
}

export function ChartWrapper({
  children,
  loading,
  hasData,
  className,
  loadingMessage = "Loading chart...",
  emptyMessage = "No data available",
  emptyStateClassName,
  minWidth = 1,
}: ChartWrapperProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setIsReady(true);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const updateSize = () => {
      const { width, height } = container.getBoundingClientRect();
      const nextWidth = Math.max(Math.floor(width), 0);
      const nextHeight = Math.max(Math.floor(height), 0);

      setContainerSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }

        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        updateSize();
      });
      observer.observe(container);

      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", updateSize);

    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  const hasRenderableSize = containerSize.width > 0 && containerSize.height > 0;
  const shouldRenderChart = !loading && hasData && isReady && hasRenderableSize;
  const shouldRenderLoading = loading || (!shouldRenderChart && hasData);

  return (
    <div ref={containerRef} className={cn("h-[300px] min-h-[300px] w-full min-w-0", className)}>
      {shouldRenderChart ? (
        <ResponsiveContainer
          width={Math.max(containerSize.width, minWidth)}
          height={Math.max(containerSize.height, 1)}
        >
          {children}
        </ResponsiveContainer>
      ) : shouldRenderLoading ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{loadingMessage}</div>
      ) : (
        <div
          className={cn(
            "flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground",
            emptyStateClassName,
          )}
        >
          {emptyMessage}
        </div>
      )}
    </div>
  );
}
