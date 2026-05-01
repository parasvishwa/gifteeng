"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Mail, Trash2, Eye, Clock, CheckCircle, AlertCircle, Search, X,
  MessageSquare, Phone, Sparkles, Loader2, Copy, Check,
} from "lucide-react";
import { Badge, Input, Button, Textarea } from "@gifteeng/ui";
import { toast } from "@gifteeng/ui";
import { authHeaders, getApiBase, safeDelete, safeGet, safePatch, safePost } from "@/lib/admin-api";

interface ContactEnquiry {
  id: string; name: string; email: string; phone: string;
  message: string; status: string; created_at: string;
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  new: { color: "bg-primary/10 text-primary border-primary/20", icon: AlertCircle, label: "New" },
  read: { color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Eye, label: "Read" },
  replied: { color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle, label: "Replied" },
  closed: { color: "bg-muted text-muted-foreground border-border", icon: Clock, label: "Closed" },
};

// ─── AI Draft Reply panel (per message) ──────────────────────
function AiDraftReply({
  message,
  onMarkReplied,
}: {
  message: ContactEnquiry;
  onMarkReplied: () => void;
}) {
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const generate = async () => {
    setLoading(true);
    setOpen(true);
    const result = await safePost<{ text?: string }>(
      "/admin/ai/write",
      {
        prompt: `Draft a professional, empathetic customer service reply to: ${message.message}`,
        field: "description",
      },
      {}
    );
    setDraft(result?.text ?? "Could not generate a reply. Please try again.");
    setLoading(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 space-y-2">
      {!open ? (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-7 text-[10px] border-primary/30 text-primary hover:bg-primary/5"
          onClick={generate}
        >
          <Sparkles className="w-3 h-3" /> Draft Reply
        </Button>
      ) : (
        <div className="bg-primary/5 border border-primary/15 rounded-lg p-3 space-y-2">
          <p className="text-[10px] font-semibold text-primary flex items-center gap-1.5 uppercase tracking-wide">
            <Sparkles className="w-3 h-3" /> AI Draft Reply
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating reply...
            </div>
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              className="text-xs resize-none bg-background"
            />
          )}
          {!loading && (
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={copy}>
                {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied!" : "Copy reply"}
              </Button>
              <Button
                size="sm"
                className="h-7 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onMarkReplied}
              >
                <CheckCircle className="w-3 h-3" /> Mark as replied
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={generate}>
                <Sparkles className="w-3 h-3 mr-1" /> Regenerate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] text-muted-foreground"
                onClick={() => setOpen(false)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const AdminContactMessages = () => {
  const [messages, setMessages] = useState<ContactEnquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const data = await safeGet<ContactEnquiry[]>("/contact-messages", []);
      setMessages(Array.isArray(data) ? data : []);
      setIsLoading(false);
    })();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    await safePatch(`/contact-messages/${id}`, { status }, null);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m));
    toast({ title: "Status updated" });
  };

  const deleteMessage = async (id: string) => {
    await safeDelete(`/contact-messages/${id}`, null);
    setMessages(prev => prev.filter(m => m.id !== id));
    setSelectedId(null);
    toast({ title: "Message deleted" });
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter(m => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || m.message?.toLowerCase().includes(q));
  }, [messages, search]);

  const selected = messages.find(m => m.id === selectedId);
  const newCount = messages.filter(m => m.status === "new").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Messages</h1>
            <p className="text-xs text-muted-foreground">{messages.length} total · {newCount} new</p>
          </div>
        </div>
      </div>

      {messages.length > 3 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search messages..." className="pl-8 h-8 text-xs pr-8" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
        </div>
      )}

      <div className="grid md:grid-cols-5 gap-5">
        <div className="md:col-span-2 space-y-1.5 max-h-[75vh] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground text-xs">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
              <MessageSquare className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm font-medium mb-0.5">{search ? "No matches" : "No messages yet"}</p>
              <p className="text-xs text-muted-foreground">{search ? "Try a different search" : "Messages from the contact form will appear here"}</p>
            </div>
          ) : (
            filtered.map(msg => {
              const cfg = STATUS_CONFIG[msg.status] || STATUS_CONFIG.new;
              const Icon = cfg.icon;
              const isActive = selectedId === msg.id;
              return (
                <button key={msg.id} onClick={() => setSelectedId(msg.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 ${
                    isActive ? "border-primary/40 bg-primary/5 shadow-sm" : "border-border/30 bg-card hover:border-border/60 hover:shadow-sm"
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${msg.status === "new" ? "text-foreground" : "text-muted-foreground"}`}>
                        {msg.name || "Anonymous"}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">{msg.email}</p>
                    </div>
                    <Badge variant="outline" className={`text-[8px] shrink-0 h-4 px-1.5 ${cfg.color}`}>
                      <Icon className="w-2.5 h-2.5 mr-0.5" />{cfg.label}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mt-1.5">{msg.message}</p>
                  <p className="text-[9px] text-muted-foreground/40 mt-2">
                    {new Date(msg.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <div className="md:col-span-3">
          {selected ? (
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <div className="flex items-start justify-between p-4 border-b border-border/30">
                <div>
                  <h2 className="text-base font-display font-bold">{selected.name}</h2>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <a href={`mailto:${selected.email}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                      <Mail className="w-3 h-3" />{selected.email}
                    </a>
                    {selected.phone && (
                      <a href={`tel:${selected.phone}`} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />{selected.phone}
                      </a>
                    )}
                  </div>
                </div>
                <button onClick={() => deleteMessage(selected.id)}
                  className="p-2 rounded-lg hover:bg-destructive/10 text-destructive/50 hover:text-destructive transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4">
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.message}</p>
                </div>

                {/* AI Draft Reply */}
                <AiDraftReply
                  message={selected}
                  onMarkReplied={() => updateStatus(selected.id, "replied")}
                />
              </div>

              <div className="px-4 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground font-medium mr-1">Status:</span>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <button key={key}
                        onClick={() => updateStatus(selected.id, key)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all flex items-center gap-1 ${
                          selected.status === key ? cfg.color : "border-border/30 text-muted-foreground hover:border-border/60"
                        }`}>
                        <Icon className="w-3 h-3" />{cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 px-4 py-3 border-t border-border/30 bg-muted/10">
                <Button asChild size="sm" className="flex-1 h-8 text-xs">
                  <a href={`mailto:${selected.email}?subject=Re: Your enquiry on Gifteeng`}>Reply via Email</a>
                </Button>
                {selected.phone && (
                  <Button asChild variant="outline" size="sm" className="flex-1 h-8 text-xs border-emerald-500/30 text-emerald-600 hover:bg-emerald-50">
                    <a href={`https://wa.me/${selected.phone.replace(/\D/g, "")}?text=Hi ${selected.name}, thank you for reaching out!`} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  </Button>
                )}
              </div>

              <p className="text-[9px] text-muted-foreground/40 px-4 py-2 border-t border-border/20">
                Received {new Date(selected.created_at).toLocaleString("en-IN")}
              </p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
              <Mail className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Select a message to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminContactMessages;