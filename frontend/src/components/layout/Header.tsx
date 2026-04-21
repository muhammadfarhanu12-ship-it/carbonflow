import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronDown, FileText, Loader2, LogOut, Plus, Search, Settings, Upload, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/src/components/ui/button";
import { AddShipmentModal } from "@/src/components/shared/AddShipmentModal";
import { UploadDataModal } from "@/src/components/shared/UploadDataModal";
import { dashboardService } from "@/src/services/dashboardService";
import { reportsService } from "@/src/services/reportsService";
import { useToast } from "@/src/components/providers/ToastProvider";
import { useAuth } from "@/src/hooks/useAuth";

type NotificationItem = {
  id: string;
  title: string;
  description: string;
};

export function Header() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [showAddShipment, setShowAddShipment] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const loadNotifications = async () => {
      setLoadingNotifications(true);
      try {
        const [dashboard, reports] = await Promise.all([
          dashboardService.getMetrics(),
          reportsService.getReports("?pageSize=3"),
        ]);

        const reportNotifications = reports.data.map((report) => ({
          id: report.id,
          title: `${report.type} report ready`,
          description: `${report.name} is available as ${report.format}.`,
        }));

        setNotifications([
          {
            id: "n-high-risk",
            title: "Supplier risk changed",
            description: `${dashboard.summary.highRiskSuppliers} suppliers currently need attention.`,
          },
          {
            id: "n-emissions",
            title: "Emissions snapshot updated",
            description: `${dashboard.summary.totalEmissions} tCO2e tracked across shipments.`,
          },
          ...reportNotifications,
          {
            id: "n-mock-policy",
            title: "Policy reminder",
            description: "Review carbon price assumptions before month-end close.",
          },
        ]);
      } catch {
        setNotifications([
          {
            id: "n-fallback",
            title: "Activity summary unavailable",
            description: "Live notifications could not be loaded right now.",
          },
        ]);
      } finally {
        setLoadingNotifications(false);
      }
    };

    loadNotifications();
  }, []);

  const userInitials = useMemo(() => (
    user?.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "CF"
  ), [user?.name]);

  const handleSearch = () => {
    const query = search.trim();
    if (!query) return;
    navigate(`/app/shipments?search=${encodeURIComponent(query)}`);
  };

  return (
    <>
      <header className="relative flex h-16 items-center justify-between border-b bg-background px-6">
        <div className="flex flex-1 items-center">
          <div className="relative w-full max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <input
              type="text"
              className="block w-full rounded-md border-0 py-1.5 pl-10 pr-3 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 bg-background"
              placeholder="Search shipments, suppliers..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSearch();
              }}
            />
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center space-x-2 mr-4">
            <Button variant="outline" size="sm" className="h-8" onClick={() => setShowAddShipment(true)}>
              <Plus className="mr-2 h-3 w-3" />
              Add Shipment
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setShowUpload(true)}>
              <Upload className="mr-2 h-3 w-3" />
              Upload Data
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => navigate("/app/reports")}>
              <FileText className="mr-2 h-3 w-3" />
              Report
            </Button>
          </div>

          <div className="flex items-center space-x-3 border-l pl-4">
            <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => navigate("/app/settings")} title="Settings">
              <Settings className="h-5 w-5" />
            </button>
            <button
              className="relative text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                setShowNotifications((current) => !current);
                setShowProfileMenu(false);
              }}
              title="Notifications"
            >
              <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500"></span>
              <Bell className="h-5 w-5" />
            </button>
            <button
              className="flex items-center gap-2 rounded-full bg-secondary px-2 py-1 text-secondary-foreground"
              onClick={() => {
                setShowProfileMenu((current) => !current);
                setShowNotifications(false);
              }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                <User className="h-4 w-4" />
              </div>
              <span className="hidden text-sm font-medium lg:inline">{userInitials}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showNotifications ? (
          <div className="absolute right-24 top-16 z-50 w-96 rounded-2xl border bg-popover p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-popover-foreground">Notifications</h3>
              {loadingNotifications ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>
            <div className="mt-3 space-y-3">
              {notifications.map((item) => (
                <div key={item.id} className="rounded-xl border bg-card p-3">
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showProfileMenu ? (
          <div className="absolute right-6 top-16 z-50 w-56 rounded-2xl border bg-popover p-2 shadow-xl">
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                showToast({ tone: "info", title: user?.name || "CarbonFlow user", description: user?.email || "" });
                setShowProfileMenu(false);
              }}
            >
              <User className="h-4 w-4" />
              Profile
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                navigate("/app/settings");
                setShowProfileMenu(false);
              }}
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10" onClick={() => navigate("/auth/logout")}>
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        ) : null}
      </header>

      <AddShipmentModal open={showAddShipment} onClose={() => setShowAddShipment(false)} onCreated={() => navigate("/app/shipments")} />
      <UploadDataModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={() => navigate("/app/shipments")} />
    </>
  );
}
