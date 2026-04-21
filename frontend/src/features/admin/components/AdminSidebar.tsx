import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  Building2,
  Database,
  FileText,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
} from "lucide-react";
import { cn } from "@/src/utils/cn";

const navigation = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Companies", href: "/admin/companies", icon: Building2 },
  { name: "Shipments", href: "/admin/shipments", icon: Truck },
  { name: "Carbon Data", href: "/admin/carbon-data", icon: Database },
  { name: "Marketplace", href: "/admin/marketplace", icon: ShoppingBag },
  { name: "Reports", href: "/admin/reports", icon: FileText },
  { name: "System Logs", href: "/admin/system", icon: Activity },
  { name: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const location = useLocation();

  return (
    <aside className="hidden h-full w-64 shrink-0 border-r bg-card lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <p className="text-sm font-semibold text-foreground">CarbonFlow</p>
          <p className="text-xs text-muted-foreground">Admin Panel</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href || (item.href !== "/admin" && location.pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "group flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "mr-3 h-5 w-5",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
