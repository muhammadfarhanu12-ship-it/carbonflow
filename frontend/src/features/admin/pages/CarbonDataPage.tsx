import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { adminService } from "../services/adminService";
import type { EmissionFactor } from "../types";

export function CarbonDataPage() {
  const [factors, setFactors] = useState<EmissionFactor[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminService.getEmissionFactors()
      .then((response) => setFactors(response.data))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Carbon Data Management</h2>
        <p className="text-muted-foreground">Review the emission factors used in platform calculations.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Emission Factors</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-destructive">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Category</th>
                    <th className="px-6 py-3 font-medium">Value</th>
                    <th className="px-6 py-3 font-medium">Unit</th>
                    <th className="px-6 py-3 font-medium">Source</th>
                    <th className="px-6 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {factors.map((factor) => (
                    <tr key={factor.id} className="hover:bg-muted/40">
                      <td className="px-6 py-4 font-medium text-foreground">{factor.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{factor.category}</td>
                      <td className="px-6 py-4 font-medium text-primary">{factor.value}</td>
                      <td className="px-6 py-4 text-muted-foreground">{factor.unit}</td>
                      <td className="px-6 py-4 text-muted-foreground">{factor.source || "Internal"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{new Date(factor.updatedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {factors.length === 0 && !error && (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-muted-foreground">No emission factors found.</td>
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
