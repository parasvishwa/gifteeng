"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@gifteeng/ui";
import { apiB2b } from "@/lib/api";
import { InviteEmployeeDialog } from "../_components/InviteEmployeeDialog";

type Employee = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string | null;
};

type CsvRow = {
  email: string;
  fullName: string;
  role: string;
};

type CsvResult = {
  row: CsvRow;
  ok: boolean;
  message?: string;
};

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const emailIdx = header.indexOf("email");
  const nameIdx = header.indexOf("fullname");
  const roleIdx = header.indexOf("role");
  if (emailIdx === -1 || nameIdx === -1 || roleIdx === -1) {
    throw new Error("CSV must have headers: email,fullName,role");
  }
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    return {
      email: cells[emailIdx] ?? "",
      fullName: cells[nameIdx] ?? "",
      role: cells[roleIdx] ?? "employee",
    };
  });
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [inviteOpen, setInviteOpen] = useState<boolean>(false);
  const [csvOpen, setCsvOpen] = useState<boolean>(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvResults, setCsvResults] = useState<CsvResult[]>([]);
  const [csvProcessing, setCsvProcessing] = useState<boolean>(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const data = await api.get<Employee[]>("/api/companies/me/employees");
      setEmployees(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "employees endpoint not wired yet",
      );
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.fullName?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q),
    );
  }, [employees, search]);

  const onCsvFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result ?? ""));
        setCsvRows(rows);
        setCsvResults([]);
        setCsvError(null);
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : "Bad CSV");
        setCsvRows([]);
      }
    };
    reader.readAsText(file);
  };

  const runBulkInvite = async (): Promise<void> => {
    setCsvProcessing(true);
    const api = apiB2b();
    const results: CsvResult[] = [];
    for (const row of csvRows) {
      try {
        await api.post("/api/auth/b2b/invite", row);
        results.push({ row, ok: true });
      } catch (err) {
        results.push({
          row,
          ok: false,
          message: err instanceof Error ? err.message : "Failed",
        });
      }
      setCsvResults([...results]);
    }
    setCsvProcessing(false);
    void load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage your company's employees and HR admins"
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email..."
              className="max-w-xs"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCsvOpen(true)}>
                Bulk invite (CSV)
              </Button>
              <Button onClick={() => setInviteOpen(true)}>
                Invite employee
              </Button>
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-40" />
          ) : error ? (
            <EmptyState
              title="No employees"
              description={error}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No matches"
              description="No employees match your search."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Active</TableCell>
                  <TableCell>Last login</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.fullName}</TableCell>
                    <TableCell>{e.email}</TableCell>
                    <TableCell>
                      <Badge>{e.role}</Badge>
                    </TableCell>
                    <TableCell>{e.isActive ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      {e.lastLoginAt
                        ? new Date(e.lastLoginAt).toLocaleString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InviteEmployeeDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={() => void load()}
      />

      <Dialog
        open={csvOpen}
        onOpenChange={(next: boolean) => {
          setCsvOpen(next);
          if (!next) {
            setCsvRows([]);
            setCsvResults([]);
            setCsvError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk invite via CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload a CSV with headers: <code>email,fullName,role</code>
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onCsvFile}
              className="block text-sm"
            />
            {csvError ? (
              <p className="text-sm text-red-600">{csvError}</p>
            ) : null}
            {csvRows.length > 0 ? (
              <div className="max-h-64 overflow-auto rounded border text-xs">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">Email</th>
                      <th className="p-2 text-left">Name</th>
                      <th className="p-2 text-left">Role</th>
                      <th className="p-2 text-left">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((r, idx) => {
                      const result = csvResults[idx];
                      return (
                        <tr key={`${r.email}-${idx}`} className="border-t">
                          <td className="p-2">{r.email}</td>
                          <td className="p-2">{r.fullName}</td>
                          <td className="p-2">{r.role}</td>
                          <td className="p-2">
                            {result
                              ? result.ok
                                ? "OK"
                                : `Fail: ${result.message ?? ""}`
                              : csvProcessing
                                ? "..."
                                : "Pending"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCsvOpen(false)}
              disabled={csvProcessing}
            >
              Close
            </Button>
            <Button
              onClick={() => void runBulkInvite()}
              disabled={csvProcessing || csvRows.length === 0}
            >
              {csvProcessing ? "Inviting..." : `Invite ${csvRows.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
