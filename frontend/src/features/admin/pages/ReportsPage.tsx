import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { adminService } from "../services/adminService";
import type { BillingOverview, Invoice } from "../types";

export function ReportsPage() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminService.getBillingOverview(),
      adminService.getInvoices(),
    ])
      .then(([billingOverview, invoiceResponse]) => {
        setOverview(billingOverview);
        setInvoices(invoiceResponse.data);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Reports & Billing</h2>
        <p className="text-muted-foreground">Keep an eye on revenue health and invoice lifecycle across the platform.</p>
      </div>

      {error && <div className="rounded-xl border bg-card p-6 text-sm text-destructive">{error}</div>}

      {overview && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Total Invoiced" value={`$${overview.totalInvoiced.toLocaleString()}`} />
          <SummaryCard title="Paid Revenue" value={`$${overview.paidRevenue.toLocaleString()}`} />
          <SummaryCard title="Outstanding" value={`$${overview.outstandingRevenue.toLocaleString()}`} />
          <SummaryCard title="Overdue Invoices" value={overview.overdueInvoices.toLocaleString()} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Invoices</CardTitle>
          <CardDescription>Latest billing activity across customer companies.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Invoice</th>
                  <th className="px-6 py-3 font-medium">Company</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-muted/40">
                    <td className="px-6 py-4 font-medium text-foreground">{invoice.invoiceNumber}</td>
                    <td className="px-6 py-4 text-muted-foreground">{invoice.company?.name || "Unknown company"}</td>
                    <td className="px-6 py-4 text-muted-foreground">${invoice.amountUsd.toLocaleString()}</td>
                    <td className="px-6 py-4 text-muted-foreground">{invoice.status}</td>
                    <td className="px-6 py-4 text-muted-foreground">{new Date(invoice.issuedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {invoices.length === 0 && !error && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-muted-foreground">No invoices found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
