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
  minWidth = 300,
}: ChartWrapperProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasSize, setHasSize] = useState(false);

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

    const updateHasSize = () => {
      const { width, height } = container.getBoundingClientRect();
      setHasSize(width > 0 && height > 0);
    };

    updateHasSize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        updateHasSize();
      });
      observer.observe(container);

      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", updateHasSize);

    return () => {
      window.removeEventListener("resize", updateHasSize);
    };
  }, []);

  const shouldRenderChart = !loading && hasData && isReady && hasSize;
  const shouldRenderLoading = loading || (!shouldRenderChart && hasData);

  return (
    <div ref={containerRef} className={cn("h-[300px] min-h-[300px] w-full min-w-0", className)}>
      {shouldRenderChart ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={minWidth}>
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
