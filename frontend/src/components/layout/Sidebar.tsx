import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Truck, 
  Users, 
  BarChart3, 
  Settings, 
  Leaf,
  LineChart,
  ShoppingBag,
  FileClock,
  Database,
  Upload,
  ClipboardCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/src/utils/cn";
import { useAuth } from "@/src/hooks/useAuth";
import { hasPermission, type Permission } from "@/src/utils/permissions";
import { navigationService, type NavigationSummary } from "@/src/services/navigationService";

type NavigationItem = {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  permissions?: Permission[];
  badgeKey?: keyof NavigationSummary;
};

export const navigation: NavigationItem[] = [
  { name: "Dashboard", href: "/app", icon: LayoutDashboard },
  { name: "Shipments", href: "/app/shipments", icon: Truck, permissions: ["shipment:view"] },
  { name: "Suppliers", href: "/app/suppliers", icon: Users, permissions: ["supplier:view"] },
  { name: "Carbon Ledger", href: "/app/ledger", icon: BarChart3, permissions: ["emission:view"], badgeKey: "missingFactors" },
  { name: "Emission Factors", href: "/app/emission-factors", icon: Database, permissions: ["factor:view", "factor:manage"], badgeKey: "missingFactors" },
  { name: "Data Imports", href: "/app/imports", icon: Upload, permissions: ["import:view", "import:create"], badgeKey: "failedImports" },
  { name: "Optimization", href: "/app/optimization", icon: LineChart, permissions: ["optimization:view", "optimization:run"] },
  { name: "Marketplace", href: "/app/marketplace", icon: ShoppingBag, permissions: ["marketplace:view", "marketplace:checkout"] },
  { name: "Reports", href: "/app/reports", icon: Leaf, permissions: ["report:view", "report:generate"], badgeKey: "failedReports" },
  { name: "Approvals", href: "/app/approvals", icon: ClipboardCheck, permissions: ["approvals:view", "emission:approve", "supplier:evidence:verify", "marketplace:budget:manage"], badgeKey: "pendingApprovals" },
  { name: "Audit Logs", href: "/app/audit-logs", icon: FileClock, permissions: ["audit:view", "supplier:audit:view"], badgeKey: "criticalAuditEvents" },
  { name: "Settings", href: "/app/settings", icon: Settings, permissions: ["settings:view"] },
];

export function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const [summary, setSummary] = useState<NavigationSummary | null>(null);
  const visibleNavigation = useMemo(() => navigation.filter((item) => (
    !item.permissions || item.permissions.some((permission) => hasPermission(user, permission))
  )), [user]);

  useEffect(() => {
    let cancelled = false;
    navigationService.getSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center px-6 border-b">
        <Leaf className="h-6 w-6 text-primary mr-2" />
        <span className="text-lg font-bold text-foreground">CarbonFlow</span>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {visibleNavigation.map((item) => {
            const isActive = item.href === "/app" ? location.pathname === item.href : location.pathname.startsWith(item.href);
            const badge = item.badgeKey && summary ? Number(summary[item.badgeKey] || 0) : 0;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {badge > 0 ? <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{badge > 99 ? "99+" : badge}</span> : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
