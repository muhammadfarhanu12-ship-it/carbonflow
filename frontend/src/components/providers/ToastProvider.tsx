import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (toast: Omit<ToastItem, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const AUTH_UNAUTHORIZED_EVENT = "carbonflow:unauthorized";
const API_ERROR_EVENT = "carbonflow:api-error";

type AuthFailureDetail = {
  reason?: "session_expired" | "unauthorized";
  message?: string;
};

type ApiFailureDetail = {
  message?: string;
  statusCode?: number;
  path?: string;
};

const toneMap = {
  success: {
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  error: {
    icon: CircleAlert,
    className: "border-rose-200 bg-rose-50 text-rose-900",
  },
  info: {
    icon: Info,
    className: "border-sky-200 bg-sky-50 text-sky-900",
  },
} satisfies Record<ToastTone, { icon: typeof Info; className: string }>;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => removeToast(id), 4500);
  }, [removeToast]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const onUnauthorized = (event: Event) => {
      const detail = (event as CustomEvent<AuthFailureDetail>).detail || {};
      const isSessionExpired = detail.reason === "session_expired";

      showToast({
        tone: "error",
        title: isSessionExpired ? "Session expired" : "Unauthorized access",
        description: isSessionExpired
          ? "Your session has expired. Please sign in again."
          : detail.message || "You are not authorized to access this resource.",
      });
    };

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);

    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    };
  }, [showToast]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const onApiFailure = (event: Event) => {
      const detail = (event as CustomEvent<ApiFailureDetail>).detail || {};
      if (!detail.message) {
        return;
      }

      const statusCode = Number(detail.statusCode || 0);
      const title = statusCode >= 500
        ? "Server error"
        : statusCode >= 400
          ? "Request failed"
          : "Unexpected error";

      showToast({
        tone: "error",
        title,
        description: detail.message,
      });
    };

    window.addEventListener(API_ERROR_EVENT, onApiFailure);

    return () => {
      window.removeEventListener(API_ERROR_EVENT, onApiFailure);
    };
  }, [showToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => {
          const style = toneMap[toast.tone];
          const Icon = style.icon;

          return (
            <div key={toast.id} className={`pointer-events-auto rounded-xl border shadow-lg ${style.className}`}>
              <div className="flex items-start gap-3 p-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{toast.title}</p>
                  {toast.description ? <p className="mt-1 text-sm opacity-90">{toast.description}</p> : null}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => removeToast(toast.id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
