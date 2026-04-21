import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { adminService } from "../services/adminService";
import type { AdminMarketplaceProject } from "../types";

export function MarketplacePage() {
  const [projects, setProjects] = useState<AdminMarketplaceProject[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminService.getMarketplaceProjects()
      .then((response) => setProjects(response.data))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Marketplace Management</h2>
        <p className="text-muted-foreground">Review all marketplace lifecycle states, including inactive and archived listings retained for audit history.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Carbon Projects</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-destructive">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">Project</th>
                    <th className="px-6 py-3 font-medium">Registry</th>
                    <th className="px-6 py-3 font-medium">Price/Ton</th>
                    <th className="px-6 py-3 font-medium">Available Credits</th>
                    <th className="px-6 py-3 font-medium">Retired Credits</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">History Lock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projects.map((project) => (
                    <tr key={project.id} className="hover:bg-muted/40">
                      <td className="px-6 py-4 font-medium text-foreground">{project.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{project.registry}</td>
                      <td className="px-6 py-4 text-muted-foreground">${project.pricePerTon.toLocaleString()}</td>
                      <td className="px-6 py-4 text-muted-foreground">{project.carbonCreditsAvailable.toLocaleString()}</td>
                      <td className="px-6 py-4 text-muted-foreground">{project.retiredCredits.toLocaleString()}</td>
                      <td className="px-6 py-4 text-muted-foreground">{project.status}</td>
                      <td className="px-6 py-4 text-muted-foreground">{project.immutable ? "Immutable" : "Editable"}</td>
                    </tr>
                  ))}
                  {projects.length === 0 && !error && (
                    <tr>
                      <td colSpan={7} className="px-6 py-6 text-center text-muted-foreground">No marketplace projects found.</td>
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
