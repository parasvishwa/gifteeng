"use client";

import { use, useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PageHeader,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@gifteeng/ui";
import { apiB2b } from "@/lib/api";

type Allocation = {
  id: string;
  employeeName?: string;
  employeeEmail?: string;
  amount: number;
  redeemedAmount?: number;
  status: string;
};

type CampaignDetail = {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  budgetTotal: number;
  budgetConsumed?: number;
  perEmployeeAmount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  allocations?: Allocation[];
};

type Employee = { id: string; fullName: string; email: string };

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [allocateOpen, setAllocateOpen] = useState<boolean>(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allocating, setAllocating] = useState<boolean>(false);

  const [completeOpen, setCompleteOpen] = useState<boolean>(false);
  const [completing, setCompleting] = useState<boolean>(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const data = await api.get<CampaignDetail>(`/api/campaigns/${id}`);
      setCampaign(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAllocate = async (): Promise<void> => {
    setAllocateOpen(true);
    setSelected(new Set());
    try {
      const data = await apiB2b().get<Employee[]>(
        "/api/companies/me/employees",
      );
      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setEmployees([]);
    }
  };

  const confirmAllocate = async (): Promise<void> => {
    setAllocating(true);
    try {
      await apiB2b().post(`/api/campaigns/${id}/allocate`, {
        companyUserIds: Array.from(selected),
      });
      setAllocateOpen(false);
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Allocation failed");
    } finally {
      setAllocating(false);
    }
  };

  const confirmComplete = async (): Promise<void> => {
    setCompleting(true);
    try {
      await apiB2b().post(`/api/campaigns/${id}/complete`);
      setCompleteOpen(false);
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Complete failed");
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-96" />;
  }

  if (error || !campaign) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error ?? "Campaign not found"}
      </div>
    );
  }

  const consumed = campaign.budgetConsumed ?? 0;
  const remaining = Math.max(0, campaign.budgetTotal - consumed);
  const pct =
    campaign.budgetTotal > 0
      ? Math.min(100, Math.round((consumed / campaign.budgetTotal) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.title}
        description={campaign.description ?? undefined}
      />

      <div className="flex items-center justify-between">
        <StatusBadge status={campaign.status} />
        <div className="space-x-2">
          <Button variant="outline" onClick={() => void openAllocate()}>
            Allocate to more employees
          </Button>
          {campaign.status === "active" ? (
            <Button onClick={() => setCompleteOpen(true)}>
              Complete campaign
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>Consumed: {consumed}</span>
            <span>Remaining: {remaining}</span>
            <span>Total: {campaign.budgetTotal}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          {!campaign.allocations || campaign.allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No allocations yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell className="text-right">Amount</TableCell>
                  <TableCell className="text-right">Redeemed</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaign.allocations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.employeeName ?? "—"}</TableCell>
                    <TableCell>{a.employeeEmail ?? "—"}</TableCell>
                    <TableCell className="text-right">{a.amount}</TableCell>
                    <TableCell className="text-right">
                      {a.redeemedAmount ?? 0}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={allocateOpen}
        onOpenChange={(next: boolean) => {
          setAllocateOpen(next);
          if (!next) setSelected(new Set());
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate employees</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-auto">
            {employees.map((e) => {
              const checked = selected.has(e.id);
              return (
                <label
                  key={e.id}
                  className="flex items-center gap-2 rounded border p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(ev) => {
                      const next = new Set(selected);
                      if (ev.target.checked) next.add(e.id);
                      else next.delete(e.id);
                      setSelected(next);
                    }}
                  />
                  <span>{e.fullName}</span>
                  <span className="text-muted-foreground">{e.email}</span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAllocateOpen(false)}
              disabled={allocating}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmAllocate()}
              disabled={allocating || selected.size === 0}
            >
              {allocating ? "Allocating..." : `Allocate ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={completeOpen}
        onOpenChange={(next: boolean) => setCompleteOpen(next)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete campaign?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will finalize allocations and close the campaign.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompleteOpen(false)}
              disabled={completing}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmComplete()}
              disabled={completing}
            >
              {completing ? "Completing..." : "Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
