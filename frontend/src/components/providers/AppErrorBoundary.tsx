import React from "react";
import { Button } from "@/src/components/ui/button";
import { clearStoredSession } from "@/src/utils/authSession";

type AppErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: "",
  };

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error.message || "Unexpected interface error",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("CarbonFlow UI crashed", error, errorInfo);
    }
  }

  private clearSessionAndReload = () => {
    clearStoredSession();
    window.location.assign("/auth/signin?session=expired");
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
          <div className="max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-foreground">CarbonFlow hit an unexpected issue</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              The interface can be recovered without losing your data. Try again, go back to the dashboard, or clear your local session if sign-in data is stale.
            </p>
            {import.meta.env.DEV && this.state.errorMessage ? (
              <p className="mt-4 rounded-md bg-muted px-3 py-2 text-left text-xs text-muted-foreground">
                {this.state.errorMessage}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-3">
              <Button onClick={() => window.location.reload()}>
                Retry
              </Button>
              <Button variant="outline" onClick={() => window.location.assign("/app")}>
                Go to dashboard
              </Button>
              <Button variant="ghost" onClick={this.clearSessionAndReload}>
                Clear local session
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
