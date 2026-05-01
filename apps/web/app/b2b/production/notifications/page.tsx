"use client";

import { useEffect, useState } from "react";
import { apiB2b } from "@/lib/api";

interface NotificationItem {
  id: string;
  title?: string;
  message?: string;
  createdAt?: string;
  read?: boolean;
}

export default function ProductionNotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const api = apiB2b();
        const res = await api.get<
          { notifications?: NotificationItem[] } | NotificationItem[]
        >(`/api/notifications?recipient=production`);
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res.notifications ?? [];
        setItems(list);
      } catch {
        if (!cancelled) {
          setError("Failed to load notifications");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          System alerts for the production team
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No notifications yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className="rounded-md border bg-card p-3 text-sm shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{n.title ?? "Notification"}</div>
                <div className="text-xs text-muted-foreground">
                  {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                </div>
              </div>
              {n.message && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {n.message}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
