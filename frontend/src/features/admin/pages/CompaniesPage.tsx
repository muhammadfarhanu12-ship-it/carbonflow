import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { adminService } from "../services/adminService";
import type { AdminCompany } from "../types";

export function CompaniesPage() {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminService.getCompanies()
      .then((response) => setCompanies(response.data))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Company Management</h2>
        <p className="text-muted-foreground">Monitor company plans, lifecycle status, and seat counts.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-destructive">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">Company</th>
                    <th className="px-6 py-3 font-medium">Industry</th>
                    <th className="px-6 py-3 font-medium">Plan</th>
                    <th className="px-6 py-3 font-medium">Users</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Created At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {companies.map((company) => (
                    <tr key={company.id} className="hover:bg-muted/40">
                      <td className="px-6 py-4 font-medium text-foreground">{company.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{company.industry}</td>
                      <td className="px-6 py-4 text-muted-foreground">{company.planType}</td>
                      <td className="px-6 py-4 text-muted-foreground">{company._count?.users || 0}</td>
                      <td className="px-6 py-4 text-muted-foreground">{company.status}</td>
                      <td className="px-6 py-4 text-muted-foreground">{new Date(company.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {companies.length === 0 && !error && (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-muted-foreground">No companies found.</td>
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
