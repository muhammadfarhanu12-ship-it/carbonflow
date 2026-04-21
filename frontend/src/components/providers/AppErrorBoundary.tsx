import React from "react";
import { Button } from "@/src/components/ui/button";

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("CarbonFlow UI crashed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
          <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-foreground">CarbonFlow hit an unexpected issue</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              The interface can be recovered without losing your data. Refresh the page to continue.
            </p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              Reload application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
