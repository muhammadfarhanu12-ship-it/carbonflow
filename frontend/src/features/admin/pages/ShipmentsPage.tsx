import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { adminService } from "../services/adminService";
import type { AdminShipment } from "../types";

export function ShipmentsPage() {
  const [shipments, setShipments] = useState<AdminShipment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminService.getShipments()
      .then((response) => setShipments(response.data))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Shipment Monitoring</h2>
        <p className="text-muted-foreground">Track transport activity across every tenant company.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Shipments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-destructive">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">Shipment</th>
                    <th className="px-6 py-3 font-medium">Company</th>
                    <th className="px-6 py-3 font-medium">Origin</th>
                    <th className="px-6 py-3 font-medium">Destination</th>
                    <th className="px-6 py-3 font-medium">Mode</th>
                    <th className="px-6 py-3 font-medium">Weight</th>
                    <th className="px-6 py-3 font-medium">Cost</th>
                    <th className="px-6 py-3 font-medium">Emissions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shipments.map((shipment) => (
                    <tr key={shipment.id} className="hover:bg-muted/40">
                      <td className="px-6 py-4 font-medium text-foreground">{shipment.id.slice(0, 8)}...</td>
                      <td className="px-6 py-4 text-muted-foreground">{shipment.company?.name || "N/A"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{shipment.origin}</td>
                      <td className="px-6 py-4 text-muted-foreground">{shipment.destination}</td>
                      <td className="px-6 py-4 text-muted-foreground">{shipment.transportMode}</td>
                      <td className="px-6 py-4 text-muted-foreground">{shipment.weightKg.toLocaleString()} kg</td>
                      <td className="px-6 py-4 text-muted-foreground">${shipment.costUsd.toLocaleString()}</td>
                      <td className="px-6 py-4 font-medium text-primary">{shipment.emissionsTonnes.toFixed(2)} tCO2e</td>
                    </tr>
                  ))}
                  {shipments.length === 0 && !error && (
                    <tr>
                      <td colSpan={8} className="px-6 py-6 text-center text-muted-foreground">No shipments found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
