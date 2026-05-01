"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
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
  Label,
  PageHeader,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@gifteeng/ui";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { apiB2b } from "@/lib/api";

type CampaignType =
  | "festival"
  | "reward"
  | "onboarding"
  | "milestone"
  | "custom";

type Campaign = {
  id: string;
  title: string;
  description?: string;
  type: CampaignType | string;
  status: string;
  budgetTotal: number;
  perEmployeeAmount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  currency?: string;
};

type Employee = {
  id: string;
  fullName: string;
  email: string;
};

type Allocation = {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  allocatedAmount: number;
  usedAmount: number;
  remainingAmount: number;
  hasOrdered: boolean;
};

type WizardStep = 1 | 2 | 3;

type WizardState = {
  type: CampaignType;
  title: string;
  description: string;
  budgetTotal: string;
  perEmployeeAmount: string;
  startsAt: string;
  endsAt: string;
};

const emptyWizard: WizardState = {
  type: "reward",
  title: "",
  description: "",
  budgetTotal: "",
  perEmployeeAmount: "",
  startsAt: "",
  endsAt: "",
};

// ─── Circular Progress ────────────────────────────────────────────────────────
function CircularProgress({ pct }: { pct: number }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <svg width={72} height={72} className="-rotate-90">
      <circle
        cx={36}
        cy={36}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
        className="text-muted/30"
      />
      <circle
        cx={36}
        cy={36}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary transition-all duration-500"
      />
      <text
        x={36}
        y={36}
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 fill-foreground text-[11px] font-bold"
        style={{ transform: "rotate(90deg)", transformOrigin: "36px 36px", fontSize: 11 }}
      >
        {pct}%
      </text>
    </svg>
  );
}

// ─── Redemption Panel ─────────────────────────────────────────────────────────
function RedemptionPanel({ campaigns }: { campaigns: Campaign[] }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loadingAlloc, setLoadingAlloc] = useState(false);
  const [allocError, setAllocError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeCampaigns = campaigns.filter(
    (c) => c.status === "active" || c.status === "completed",
  );

  const fetchAllocations = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingAlloc(true);
    setAllocError(null);
    try {
      const data = await apiB2b().get<Allocation[]>(
        `/api/campaigns/${id}/allocations`,
      );
      setAllocations(Array.isArray(data) ? data : []);
    } catch (e) {
      setAllocError(e instanceof Error ? e.message : "Failed to load data");
      setAllocations([]);
    } finally {
      setLoadingAlloc(false);
    }
  }, []);

  // Start/stop auto-refresh when panel is open and a campaign is selected
  useEffect(() => {
    if (!open || !selectedId) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    void fetchAllocations(selectedId);
    intervalRef.current = setInterval(() => {
      void fetchAllocations(selectedId);
    }, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, selectedId, fetchAllocations]);

  const handleCampaignChange = (id: string) => {
    setSelectedId(id);
    setAllocations([]);
  };

  const notRedeemed = allocations.filter(
    (a) => !a.hasOrdered || a.usedAmount === 0,
  );
  const redeemed = allocations.filter((a) => a.hasOrdered && a.usedAmount > 0);
  const total = allocations.length;
  const pct = total > 0 ? Math.round((redeemed.length / total) * 100) : 0;

  const selectedCampaign = campaigns.find((c) => c.id === selectedId);

  const daysSinceStart = (c: Campaign): number => {
    if (!c.startsAt) return 0;
    const diff = Date.now() - new Date(c.startsAt).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  };

  const buildWhatsAppMsg = (alloc: Allocation): string => {
    const amount = alloc.allocatedAmount ?? alloc.remainingAmount;
    const company = selectedCampaign?.title ?? "your company";
    return encodeURIComponent(
      `Hi ${alloc.employeeName}, your \u20B9${amount} gift budget from ${company} is waiting! Shop at gifteeng.com \uD83C\uDF81`,
    );
  };

  const exportCSV = () => {
    const rows = [
      ["Name", "Email", "Allocated Budget", "Used", "Remaining"].join(","),
      ...notRedeemed.map((a) =>
        [
          `"${a.employeeName}"`,
          `"${a.employeeEmail}"`,
          a.allocatedAmount,
          a.usedAmount,
          a.remainingAmount,
        ].join(","),
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `not-redeemed-${selectedId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardContent className="p-4">
        {/* Collapsible header */}
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <div>
            <p className="font-semibold text-base">Redemption Status</p>
            <p className="text-xs text-muted-foreground">
              See who hasn&apos;t used their gift budget yet
            </p>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {open && (
          <div className="mt-4 space-y-5">
            {/* Campaign selector */}
            <div className="flex items-center gap-3">
              <Label htmlFor="redemption-campaign" className="shrink-0">
                Campaign
              </Label>
              {activeCampaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active or completed campaigns yet.
                </p>
              ) : (
                <select
                  id="redemption-campaign"
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm w-64"
                  value={selectedId}
                  onChange={(e) => handleCampaignChange(e.target.value)}
                >
                  <option value="">— Select a campaign —</option>
                  {activeCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              )}
              {selectedId && (
                <button
                  type="button"
                  title="Refresh"
                  onClick={() => void fetchAllocations(selectedId)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Content */}
            {!selectedId ? null : loadingAlloc ? (
              <Skeleton className="h-32" />
            ) : allocError ? (
              <EmptyState title="Error" description={allocError} />
            ) : (
              <>
                {/* Summary stats */}
                <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4 bg-muted/20">
                  <div className="flex flex-col items-center gap-0.5 min-w-[72px]">
                    <CircularProgress pct={pct} />
                    <span className="text-[11px] text-muted-foreground mt-1">
                      Redemption
                    </span>
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-2xl font-bold">{total}</p>
                      <p className="text-xs text-muted-foreground">
                        Total employees
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">
                        {redeemed.length}
                      </p>
                      <p className="text-xs text-muted-foreground">Redeemed</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-500">
                        {notRedeemed.length}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Not yet redeemed
                      </p>
                    </div>
                  </div>
                </div>

                {/* Not-redeemed list */}
                {notRedeemed.length === 0 ? (
                  <EmptyState
                    title="All employees have redeemed!"
                    description="Everyone has placed an order for this campaign."
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Not yet redeemed ({notRedeemed.length})
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={exportCSV}
                      >
                        Export CSV
                      </Button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell className="text-right">
                              Allocated
                            </TableCell>
                            <TableCell className="text-right">
                              Days since start
                            </TableCell>
                            <TableCell className="text-right">Action</TableCell>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {notRedeemed.map((a) => (
                            <TableRow key={a.employeeId}>
                              <TableCell className="font-medium">
                                {a.employeeName}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {a.employeeEmail}
                              </TableCell>
                              <TableCell className="text-right">
                                ₹{a.allocatedAmount}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {selectedCampaign
                                  ? daysSinceStart(selectedCampaign)
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                <a
                                  href={`https://wa.me/?text=${buildWhatsAppMsg(a)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-green-500 px-2.5 py-1 text-xs font-medium text-green-600 hover:bg-green-50 transition-colors"
                                >
                                  Remind
                                </a>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = useState<boolean>(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState<WizardState>(emptyWizard);
  const [creating, setCreating] = useState<boolean>(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  const [allocateFor, setAllocateFor] = useState<Campaign | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    new Set(),
  );
  const [allocating, setAllocating] = useState<boolean>(false);

  const [completeFor, setCompleteFor] = useState<Campaign | null>(null);
  const [completing, setCompleting] = useState<boolean>(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const data = await api.get<Campaign[]>("/api/campaigns");
      setCampaigns(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaigns");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetWizard = (): void => {
    setForm(emptyWizard);
    setStep(1);
    setWizardError(null);
  };

  const submitCreate = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setCreating(true);
    setWizardError(null);
    try {
      const api = apiB2b();
      await api.post("/api/campaigns", {
        type: form.type,
        title: form.title,
        description: form.description || undefined,
        budgetTotal: Number(form.budgetTotal),
        perEmployeeAmount: form.perEmployeeAmount
          ? Number(form.perEmployeeAmount)
          : undefined,
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
      });
      setWizardOpen(false);
      resetWizard();
      void load();
    } catch (err) {
      setWizardError(
        err instanceof Error ? err.message : "Failed to create campaign",
      );
    } finally {
      setCreating(false);
    }
  };

  const activateCampaign = async (id: string): Promise<void> => {
    try {
      await apiB2b().post(`/api/campaigns/${id}/activate`);
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Activate failed");
    }
  };

  const openAllocate = async (c: Campaign): Promise<void> => {
    setAllocateFor(c);
    setSelectedEmployeeIds(new Set());
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
    if (!allocateFor) return;
    setAllocating(true);
    try {
      await apiB2b().post(`/api/campaigns/${allocateFor.id}/allocate`, {
        companyUserIds: Array.from(selectedEmployeeIds),
      });
      setAllocateFor(null);
      setSelectedEmployeeIds(new Set());
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Allocation failed");
    } finally {
      setAllocating(false);
    }
  };

  const confirmComplete = async (): Promise<void> => {
    if (!completeFor) return;
    setCompleting(true);
    try {
      await apiB2b().post(`/api/campaigns/${completeFor.id}/complete`);
      setCompleteFor(null);
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Complete failed");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Create and manage gifting campaigns for your employees"
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-end">
            <Button
              onClick={() => {
                resetWizard();
                setWizardOpen(true);
              }}
            >
              New campaign
            </Button>
          </div>

          {loading ? (
            <Skeleton className="h-40" />
          ) : error ? (
            <EmptyState title="Couldn't load campaigns" description={error} />
          ) : campaigns.length === 0 ? (
            <EmptyState
              title="No campaigns yet"
              description="Create your first campaign to start gifting."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell className="text-right">Budget</TableCell>
                  <TableCell className="text-right">Per employee</TableCell>
                  <TableCell>Starts</TableCell>
                  <TableCell>Ends</TableCell>
                  <TableCell className="text-right">Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/hr-admin/campaigns/${c.id}`}
                        className="hover:underline"
                      >
                        {c.title}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{c.type}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {c.budgetTotal}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.perEmployeeAmount ?? "—"}
                    </TableCell>
                    <TableCell>
                      {c.startsAt
                        ? new Date(c.startsAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {c.endsAt
                        ? new Date(c.endsAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      {c.status === "draft" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void activateCampaign(c.id)}
                        >
                          Activate
                        </Button>
                      ) : null}
                      {c.status === "active" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openAllocate(c)}
                          >
                            Allocate
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCompleteFor(c)}
                          >
                            Complete
                          </Button>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Redemption Status Panel */}
      {!loading && campaigns.length > 0 && (
        <RedemptionPanel campaigns={campaigns} />
      )}

      {/* Create wizard */}
      <Dialog
        open={wizardOpen}
        onOpenChange={(next: boolean) => {
          setWizardOpen(next);
          if (!next) resetWizard();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New campaign — step {step} of 3</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            {step === 1 ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="c-type">Type</Label>
                  <select
                    id="c-type"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.type}
                    onChange={(e) =>
                      setForm({ ...form, type: e.target.value as CampaignType })
                    }
                  >
                    <option value="festival">Festival</option>
                    <option value="reward">Reward</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="milestone">Milestone</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-title">Title</Label>
                  <Input
                    id="c-title"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-desc">Description</Label>
                  <Input
                    id="c-desc"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="c-budget">Budget total</Label>
                  <Input
                    id="c-budget"
                    type="number"
                    required
                    value={form.budgetTotal}
                    onChange={(e) =>
                      setForm({ ...form, budgetTotal: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-per">Per-employee amount</Label>
                  <Input
                    id="c-per"
                    type="number"
                    value={form.perEmployeeAmount}
                    onChange={(e) =>
                      setForm({ ...form, perEmployeeAmount: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="c-start">Starts at</Label>
                    <Input
                      id="c-start"
                      type="date"
                      value={form.startsAt}
                      onChange={(e) =>
                        setForm({ ...form, startsAt: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-end">Ends at</Label>
                    <Input
                      id="c-end"
                      type="date"
                      value={form.endsAt}
                      onChange={(e) =>
                        setForm({ ...form, endsAt: e.target.value })
                      }
                    />
                  </div>
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <div className="space-y-2 rounded border p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Type:</span> {form.type}
                </div>
                <div>
                  <span className="text-muted-foreground">Title:</span>{" "}
                  {form.title}
                </div>
                <div>
                  <span className="text-muted-foreground">Description:</span>{" "}
                  {form.description || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Budget:</span>{" "}
                  {form.budgetTotal}
                </div>
                <div>
                  <span className="text-muted-foreground">Per employee:</span>{" "}
                  {form.perEmployeeAmount || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Starts:</span>{" "}
                  {form.startsAt || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Ends:</span>{" "}
                  {form.endsAt || "—"}
                </div>
              </div>
            ) : null}

            {wizardError ? (
              <p className="text-sm text-red-600">{wizardError}</p>
            ) : null}

            <DialogFooter>
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(((step - 1) as WizardStep))}
                  disabled={creating}
                >
                  Back
                </Button>
              ) : null}
              {step < 3 ? (
                <Button
                  type="button"
                  onClick={() => setStep(((step + 1) as WizardStep))}
                >
                  Next
                </Button>
              ) : (
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create draft"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Allocate dialog */}
      <Dialog
        open={allocateFor !== null}
        onOpenChange={(next: boolean) => {
          if (!next) {
            setAllocateFor(null);
            setSelectedEmployeeIds(new Set());
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate — {allocateFor?.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-auto">
            {employees.length === 0 ? (
              <p className="text-sm text-muted-foreground">No employees.</p>
            ) : (
              employees.map((e) => {
                const checked = selectedEmployeeIds.has(e.id);
                return (
                  <label
                    key={e.id}
                    className="flex items-center gap-2 rounded border p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(ev) => {
                        const next = new Set(selectedEmployeeIds);
                        if (ev.target.checked) next.add(e.id);
                        else next.delete(e.id);
                        setSelectedEmployeeIds(next);
                      }}
                    />
                    <span>{e.fullName}</span>
                    <span className="text-muted-foreground">{e.email}</span>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAllocateFor(null)}
              disabled={allocating}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmAllocate()}
              disabled={allocating || selectedEmployeeIds.size === 0}
            >
              {allocating
                ? "Allocating..."
                : `Allocate to ${selectedEmployeeIds.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete dialog */}
      <Dialog
        open={completeFor !== null}
        onOpenChange={(next: boolean) => {
          if (!next) setCompleteFor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete campaign?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will mark &quot;{completeFor?.title}&quot; as completed and
            finalize allocations.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompleteFor(null)}
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
