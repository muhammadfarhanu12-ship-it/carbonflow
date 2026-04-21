import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { adminService } from "../services/adminService";
import type { AdminSystemLog } from "../types";

export function SystemLogsPage() {
  const [logs, setLogs] = useState<AdminSystemLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminService.getSystemLogs()
      .then((response) => setLogs(response.data))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">System Logs</h2>
        <p className="text-muted-foreground">Audit the most recent platform actions and admin activity.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Feed</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-destructive">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">Timestamp</th>
                    <th className="px-6 py-3 font-medium">Action</th>
                    <th className="px-6 py-3 font-medium">User</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/40">
                      <td className="px-6 py-4 text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-6 py-4 font-medium text-foreground">{log.actionType}</td>
                      <td className="px-6 py-4 text-muted-foreground">{log.user?.email || "System"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{log.description}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && !error && (
                    <tr>
                      <td colSpan={4} className="px-6 py-6 text-center text-muted-foreground">No logs found.</td>
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
