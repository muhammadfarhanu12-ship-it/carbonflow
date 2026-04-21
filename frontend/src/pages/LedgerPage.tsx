import { useEffect, useState } from "react";
import { BarChart3, DollarSign, Factory } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { ledgerService } from "@/src/services/ledgerService";
import { shipmentService } from "@/src/services/shipmentService";
import { socketService } from "@/src/services/socketService";
import type { LedgerEntry, LedgerOverview, Shipment } from "@/src/types/platform";

const emptyOverview: LedgerOverview = {
  data: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
  records: [],
  summary: {
    totalSpend: 0,
    totalCarbonTax: 0,
    totalCarbonCost: 0,
    totalEmissions: 0,
    carbonCostRatio: 0,
    scope1: 0,
    scope2: 0,
    scope3: 0,
  },
  breakdowns: {
    byCategory: [],
    bySupplier: [],
    byMonth: [],
  },
};

export function LedgerPage() {
  const [overview, setOverview] = useState<LedgerOverview>(emptyOverview);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPage = async () => {
    try {
      setError("");
      const [ledgerResponse, shipmentResponse] = await Promise.all([
        ledgerService.getEntries("?pageSize=20"),
        shipmentService.getShipments("?pageSize=50"),
      ]);
      setOverview(ledgerResponse);
      setShipments(shipmentResponse.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
    const unsubscribers = [
      socketService.on("ledgerUpdated", loadPage),
      socketService.on("shipmentUpdated", loadPage),
      socketService.on("shipmentCreated", loadPage),
      socketService.on("supplierUpdated", loadPage),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const createFromShipment = async () => {
    const shipment = shipments[0];
    if (!shipment) return;
    await ledgerService.createEntry({
      shipmentId: shipment.id,
      entryDate: new Date().toISOString().slice(0, 10),
      category: "FREIGHT",
      description: `Ledger entry for ${shipment.reference}`,
      logisticsCostUsd: shipment.costUsd,
      emissionsTonnes: shipment.emissionsTonnes,
    });
    await loadPage();
  };

  const summary = overview.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Carbon Ledger</h1>
          <p className="text-muted-foreground">Centralize Scope 1, 2, and 3 records with spend, supplier, and monthly breakdowns.</p>
        </div>
        <Button onClick={createFromShipment}>
          <BarChart3 className="mr-2 h-4 w-4" />
          Add Freight Entry
        </Button>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Total Emissions" value={`${summary.totalEmissions.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Scope 1" value={`${summary.scope1.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Scope 2" value={`${summary.scope2.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Scope 3" value={`${summary.scope3.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Total Spend" value={`$${summary.totalSpend.toLocaleString()}`} icon={DollarSign} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>By Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.breakdowns.byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{loading ? "Loading category breakdown..." : "No emission records yet."}</p>
            ) : overview.breakdowns.byCategory.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-foreground">{item.name}</span>
                <span className="font-semibold text-primary">{item.value.toFixed(2)} tCO2e</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Suppliers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.breakdowns.bySupplier.length === 0 ? (
              <p className="text-sm text-muted-foreground">{loading ? "Loading supplier breakdown..." : "No supplier-linked emissions yet."}</p>
            ) : overview.breakdowns.bySupplier.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-foreground">{item.name}</span>
                <span className="font-semibold text-primary">{item.value.toFixed(2)} tCO2e</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost Exposure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border p-3">
              <div className="text-foreground font-medium">Carbon Tax</div>
              <div className="mt-1 text-xl font-semibold text-destructive">${summary.totalCarbonTax.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-foreground font-medium">Carbon Cost Ratio</div>
              <div className="mt-1 text-xl font-semibold text-primary">{summary.carbonCostRatio.toFixed(2)}%</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-foreground font-medium">Ledger Carbon Cost</div>
              <div className="mt-1 text-xl font-semibold">${summary.totalCarbonCost.toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Scope Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Month</th>
                  <th className="px-6 py-3 font-medium">Scope 1</th>
                  <th className="px-6 py-3 font-medium">Scope 2</th>
                  <th className="px-6 py-3 font-medium">Scope 3</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.breakdowns.byMonth.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-4 text-center text-muted-foreground">No monthly data available.</td></tr>
                ) : overview.breakdowns.byMonth.map((item) => (
                  <tr key={item.name} className="hover:bg-muted/50">
                    <td className="px-6 py-4 font-medium text-foreground">{item.name}</td>
                    <td className="px-6 py-4">{item.scope1.toFixed(2)} tCO2e</td>
                    <td className="px-6 py-4">{item.scope2.toFixed(2)} tCO2e</td>
                    <td className="px-6 py-4">{item.scope3.toFixed(2)} tCO2e</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emission Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Scope</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium">Source</th>
                  <th className="px-6 py-3 font-medium">Supplier</th>
                  <th className="px-6 py-3 font-medium">Emissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-muted-foreground">Loading emission records...</td></tr>
                ) : overview.records.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-muted-foreground">No emission records found.</td></tr>
                ) : overview.records.map((record) => (
                  <tr key={record.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4">{new Date(record.occurredAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4">Scope {record.scope}</td>
                    <td className="px-6 py-4">{record.category}</td>
                    <td className="px-6 py-4">{record.sourceType}</td>
                    <td className="px-6 py-4">{record.supplierName || "—"}</td>
                    <td className="px-6 py-4 font-medium text-primary">{record.amountTonnes.toFixed(2)} tCO2e</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Financial Ledger Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Shipment Ref</th>
                  <th className="px-6 py-3 font-medium">Description</th>
                  <th className="px-6 py-3 text-right font-medium">Logistics Cost</th>
                  <th className="px-6 py-3 text-right font-medium">Carbon Tax</th>
                  <th className="px-6 py-3 text-right font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-muted-foreground">Loading ledger entries...</td></tr>
                ) : overview.data.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-muted-foreground">No ledger entries found.</td></tr>
                ) : overview.data.map((entry: LedgerEntry) => (
                  <tr key={entry.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4">{entry.entryDate}</td>
                    <td className="px-6 py-4 text-primary">{entry.shipment?.reference || "—"}</td>
                    <td className="px-6 py-4">{entry.description}</td>
                    <td className="px-6 py-4 text-right">${entry.logisticsCostUsd.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-destructive">${entry.carbonTaxUsd.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-bold">${entry.totalCostUsd.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon }: { title: string; value: string; icon: typeof DollarSign }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
