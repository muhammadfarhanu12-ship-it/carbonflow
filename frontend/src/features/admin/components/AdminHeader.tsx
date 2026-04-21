import { Link } from "react-router-dom";
import { Bell, LogOut, ShieldCheck } from "lucide-react";
import type { SessionUser } from "@/src/types/platform";

interface AdminHeaderProps {
  user: SessionUser | null;
}

export function AdminHeader({ user }: AdminHeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4 sm:px-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Platform administration</p>
        <h1 className="text-lg font-semibold text-foreground">Operations Console</h1>
      </div>

      <div className="flex items-center gap-4">
        <button className="rounded-full border p-2 text-muted-foreground transition-colors hover:text-foreground" type="button" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </button>

        <div className="hidden items-center gap-3 rounded-full border px-3 py-2 sm:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-medium text-foreground">{user?.name || "Admin"}</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{user?.role || "ADMIN"}</p>
          </div>
        </div>

        <Link
          to="/auth/logout"
          className="rounded-full border p-2 text-muted-foreground transition-colors hover:text-foreground"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
