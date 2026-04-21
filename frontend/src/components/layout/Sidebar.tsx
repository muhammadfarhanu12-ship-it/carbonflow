import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Truck, 
  Users, 
  BarChart3, 
  Settings, 
  Leaf,
  LineChart,
  ShoppingBag
} from "lucide-react";
import { cn } from "@/src/utils/cn";

const navigation = [
  { name: "Dashboard", href: "/app", icon: LayoutDashboard },
  { name: "Shipments", href: "/app/shipments", icon: Truck },
  { name: "Suppliers", href: "/app/suppliers", icon: Users },
  { name: "Carbon Ledger", href: "/app/ledger", icon: BarChart3 },
  { name: "Optimization", href: "/app/optimization", icon: LineChart },
  { name: "Marketplace", href: "/app/marketplace", icon: ShoppingBag },
  { name: "Reports", href: "/app/reports", icon: Leaf },
  { name: "Settings", href: "/app/settings", icon: Settings },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center px-6 border-b">
        <Leaf className="h-6 w-6 text-primary mr-2" />
        <span className="text-lg font-bold text-foreground">CarbonFlow</span>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
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
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
