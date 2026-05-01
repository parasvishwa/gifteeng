"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import {
  BarChart3, Eye, Users, Globe, Monitor, Smartphone, Tablet,
  TrendingUp, MapPin, FileText, Activity, ArrowUpRight,
  Chrome, Compass, Layers, Radio, Wifi, Download, FileDown, Map,
  ZoomIn, ZoomOut, RotateCcw, Sparkles, Loader2, Copy, Check,
} from "lucide-react";

// WorldMap disabled — optional `react-svg-worldmap` dep not installed in the new monorepo.
// The analytics page renders without the geographic map; rest of the charts still work.
// TODO: add `react-svg-worldmap` to apps/web/package.json and restore the lazy import.
const WorldMap: React.ComponentType<Record<string, unknown>> = () => null;
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Button,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@gifteeng/ui";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from "recharts";
import AdminPageGuide from "../_components/AdminPageGuide";
import { safeGet, safePost } from "@/lib/admin-api";

// Local date helpers (replacement for date-fns)
function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function format(date: Date, fmt: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const Y = date.getFullYear();
  const M = pad(date.getMonth() + 1);
  const D = pad(date.getDate());
  const H = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  if (fmt === "HH:00") return `${H}:00`;
  if (fmt === "MMM dd") return `${months[date.getMonth()]} ${D}`;
  if (fmt === "yyyy-MM-dd HH:mm:ss") return `${Y}-${M}-${D} ${H}:${m}:${s}`;
  if (fmt === "yyyy-MM-dd HH:mm") return `${Y}-${M}-${D} ${H}:${m}`;
  if (fmt === "yyyyMMdd") return `${Y}${M}${D}`;
  if (fmt === "PPpp") return date.toLocaleString();
  return date.toISOString();
}
function subDays(date: Date, days: number): Date { const d = new Date(date); d.setDate(d.getDate() - days); return d; }
function subMinutes(date: Date, mins: number): Date { const d = new Date(date); d.setMinutes(d.getMinutes() - mins); return d; }
function startOfDay(date: Date): Date { const d = new Date(date); d.setHours(0,0,0,0); return d; }
function isAfter(a: Date, b: Date): boolean { return a.getTime() > b.getTime(); }

// ─── AI Summary Card ────────────────────────────────────────────
function AiSummaryCard({
  totalViews,
  uniqueSessions,
  topPages,
  dateRange,
}: {
  totalViews: number;
  uniqueSessions: number;
  topPages: { page: string; views: number }[];
  dateRange: string;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    const metrics = {
      totalViews,
      uniqueSessions,
      dateRange,
      topPaths: topPages.slice(0, 5).map(p => ({ path: p.page, views: p.views })),
    };
    const result = await safePost<{ text?: string }>(
      "/admin/ai/write",
      {
        prompt: "Write a brief executive summary of these analytics:",
        context: JSON.stringify(metrics),
        field: "description",
      },
      {}
    );
    setSummary(result?.text ?? "Could not generate summary.");
    setLoading(false);
  };

  const copyAsEmail = () => {
    if (!summary) return;
    const email = `Subject: Analytics Report – ${dateRange}\n\nHi team,\n\n${summary}\n\nBest regards`;
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-card rounded-xl border border-primary/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-primary" /> AI Report Summary
        </h3>
        {!loading && !summary && (
          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1.5 border-primary/30 text-primary hover:bg-primary/5" onClick={generate}>
            <Sparkles className="w-3 h-3" /> Generate report summary
          </Button>
        )}
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Generating executive summary...
        </div>
      )}
      {summary && !loading && (
        <div className="space-y-2">
          <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
            <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">{summary}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={copyAsEmail}>
              {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy as email"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={generate}>
              <Sparkles className="w-3 h-3" /> Regenerate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface PageView {
  id: string;
  session_id: string;
  page_path: string;
  referrer: string;
  device_type: string;
  browser: string;
  os: string;
  country: string;
  region: string;
  city: string;
  created_at: string;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(var(--accent-foreground))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--pink-dark))",
  "hsl(var(--success))",
];

// Draggable + zoomable map container
function MapContainer({ worldMapData, liveMapDots }: { worldMapData: { country: string; value: number }[]; liveMapDots: { x: number; y: number; city: string; country: string; isNew: boolean }[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const MAP_W = 900;
  const INDIA_X_PCT = 0.685;
  const INDIA_Y_PCT = 0.42;
  const DEFAULT_ZOOM = 2.2;

  const getDefaultOffset = useCallback(() => {
    const w = containerRef.current?.clientWidth || 360;
    const h = 280;
    return {
      x: -(INDIA_X_PCT * MAP_W * DEFAULT_ZOOM) + w / 2,
      y: -(INDIA_Y_PCT * (MAP_W * 0.5) * DEFAULT_ZOOM) + h / 2,
    };
  }, []);

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [offset, setOffset] = useState({ x: -900, y: -130 });
  const [inited, setInited] = useState(false);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    if (!inited && containerRef.current) {
      setOffset(getDefaultOffset());
      setInited(true);
    }
  }, [inited, getDefaultOffset]);

  const handleZoomIn = () => setZoom((v) => Math.min(v + 0.3, 5));
  const handleZoomOut = () => setZoom((v) => Math.max(v - 0.3, 1));
  const handleReset = () => { setZoom(DEFAULT_ZOOM); setOffset(getDefaultOffset()); };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setOffset({ x: dragStart.current.ox + (e.clientX - dragStart.current.x), y: dragStart.current.oy + (e.clientY - dragStart.current.y) });
  };
  const handlePointerUp = () => { dragging.current = false; };

  // Color styling function for countries
  const stylingFunction = useCallback((context: any) => {
    const countryValue = Number(context.countryValue) || 0;
    const maxValue = Number(context.maxValue) || 1;
    const ratio = maxValue > 0 ? countryValue / maxValue : 0;
    const opacity = countryValue > 0 ? 0.3 + ratio * 0.7 : 0.08;
    return {
      fill: countryValue > 0 ? `hsl(338, 78%, ${65 - ratio * 25}%)` : "hsl(210, 15%, 88%)",
      fillOpacity: opacity,
      stroke: countryValue > 0 ? "hsl(338, 78%, 45%)" : "hsl(210, 10%, 80%)",
      strokeWidth: countryValue > 0 ? 0.6 : 0.3,
      strokeOpacity: 0.6,
      cursor: "pointer",
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="relative h-[280px] overflow-hidden rounded-lg border border-border/40 touch-none cursor-grab active:cursor-grabbing"
        style={{ background: "linear-gradient(135deg, hsl(210, 40%, 96%) 0%, hsl(200, 30%, 92%) 50%, hsl(190, 25%, 94%) 100%)" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div
          className="absolute left-0 top-0"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        >
          <div
            className="relative"
            style={{ width: MAP_W, transform: `scale(${zoom})`, transformOrigin: "top left" }}
          >
            <Suspense fallback={<div className="h-[200px] flex items-center justify-center text-muted-foreground text-xs">Loading map…</div>}>
              {/* @ts-ignore */}
              <WorldMap
                color="hsl(338, 78%, 55%)"
                valueSuffix=" views"
                size="responsive"
                data={worldMapData as any}
                backgroundColor="transparent"
                borderColor="hsl(210, 20%, 82%)"
                strokeOpacity={0.6}
                frame={false}
                styleFunction={stylingFunction}
              />
            </Suspense>

            <div className="absolute inset-0 pointer-events-none">
              {liveMapDots.map((dot, i) => (
                <div
                  key={`${dot.city}-${i}`}
                  className="absolute"
                  style={{ left: `${dot.x}%`, top: `${dot.y}%`, transform: "translate(-50%, -50%)" }}
                >
                  <div className="absolute inset-0 -ml-1 -mt-1 h-4 w-4 rounded-full bg-primary/20 animate-ping" />
                  <div className={`h-2 w-2 rounded-full shadow-sm ${dot.isNew ? "bg-success" : "bg-primary"}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
        <button type="button" onClick={handleZoomIn} className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={handleZoomOut} className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={handleReset} className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground">
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const [pageViews, setPageViews] = useState<PageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("7d");
  const [now, setNow] = useState(new Date());

  const rangeStart = useMemo(() => {
    if (dateRange === "today") return startOfDay(new Date());
    if (dateRange === "7d") return subDays(new Date(), 7);
    if (dateRange === "30d") return subDays(new Date(), 30);
    if (dateRange === "90d") return subDays(new Date(), 90);
    return subDays(new Date(), 7);
  }, [dateRange]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const data = await safeGet<PageView[]>(`/admin/page-views?since=${encodeURIComponent(rangeStart.toISOString())}&limit=5000`, []);
      setPageViews(Array.isArray(data) ? data : []);
      setLoading(false);
    };
    fetchData();
  }, [rangeStart]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const liveVisitorCount = useMemo(() => {
    const fiveMinAgo = subMinutes(now, 5);
    const recentSessions = new Set(
      pageViews.filter(pv => isAfter(new Date(pv.created_at), fiveMinAgo)).map(pv => pv.session_id)
    );
    return recentSessions.size;
  }, [pageViews, now]);

  const liveViews = useMemo(() => {
    const fiveMinAgo = subMinutes(now, 5);
    return pageViews
      .filter(pv => isAfter(new Date(pv.created_at), fiveMinAgo))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [pageViews, now]);

  const uniqueSessions = useMemo(() => new Set(pageViews.map(pv => pv.session_id)).size, [pageViews]);
  const avgPagesPerSession = useMemo(() => {
    if (uniqueSessions === 0) return 0;
    return (pageViews.length / uniqueSessions).toFixed(1);
  }, [pageViews, uniqueSessions]);

  const sessionsOverTime = useMemo(() => {
    const buckets: Record<string, { sessions: Set<string>; views: number }> = {};
    const fmt = dateRange === "today" ? "HH:00" : "MMM dd";
    pageViews.forEach(pv => {
      const key = format(new Date(pv.created_at), fmt);
      if (!buckets[key]) buckets[key] = { sessions: new Set(), views: 0 };
      buckets[key].sessions.add(pv.session_id);
      buckets[key].views++;
    });
    return Object.entries(buckets)
      .map(([label, data]) => ({ label, sessions: data.sessions.size, views: data.views }))
      .reverse();
  }, [pageViews, dateRange]);

  const sessionsByLocation = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    pageViews.forEach(pv => {
      const loc = [pv.city, pv.country].filter(Boolean).join(", ") || "Unknown";
      if (!map[loc]) map[loc] = new Set();
      map[loc].add(pv.session_id);
    });
    return Object.entries(map)
      .map(([location, sessions]) => ({ location, count: sessions.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [pageViews]);

  // Country name → ISO 2-letter code mapping for world map
  const countryNameToCode: Record<string, string> = {
    "Afghanistan":"af","Albania":"al","Algeria":"dz","Argentina":"ar","Armenia":"am","Australia":"au","Austria":"at","Azerbaijan":"az",
    "Bangladesh":"bd","Belarus":"by","Belgium":"be","Bolivia":"bo","Bosnia and Herzegovina":"ba","Brazil":"br","Bulgaria":"bg",
    "Cambodia":"kh","Cameroon":"cm","Canada":"ca","Chile":"cl","China":"cn","Colombia":"co","Costa Rica":"cr","Croatia":"hr","Cuba":"cu","Cyprus":"cy","Czech Republic":"cz","Czechia":"cz",
    "Denmark":"dk","Dominican Republic":"do","Ecuador":"ec","Egypt":"eg","El Salvador":"sv","Estonia":"ee","Ethiopia":"et",
    "Finland":"fi","France":"fr","Georgia":"ge","Germany":"de","Ghana":"gh","Greece":"gr","Guatemala":"gt",
    "Honduras":"hn","Hong Kong":"hk","Hungary":"hu","Iceland":"is","India":"in","Indonesia":"id","Iran":"ir","Iraq":"iq","Ireland":"ie","Israel":"il","Italy":"it",
    "Jamaica":"jm","Japan":"jp","Jordan":"jo","Kazakhstan":"kz","Kenya":"ke","Kuwait":"kw","Kyrgyzstan":"kg",
    "Latvia":"lv","Lebanon":"lb","Libya":"ly","Lithuania":"lt","Luxembourg":"lu","Malaysia":"my","Maldives":"mv","Mexico":"mx","Moldova":"md","Mongolia":"mn","Morocco":"ma","Mozambique":"mz","Myanmar":"mm",
    "Nepal":"np","Netherlands":"nl","New Zealand":"nz","Nicaragua":"ni","Nigeria":"ng","North Korea":"kp","North Macedonia":"mk","Norway":"no",
    "Oman":"om","Pakistan":"pk","Palestine":"ps","Panama":"pa","Paraguay":"py","Peru":"pe","Philippines":"ph","Poland":"pl","Portugal":"pt",
    "Qatar":"qa","Romania":"ro","Russia":"ru","Saudi Arabia":"sa","Senegal":"sn","Serbia":"rs","Singapore":"sg","Slovakia":"sk","Slovenia":"si","Somalia":"so","South Africa":"za","South Korea":"kr","Spain":"es","Sri Lanka":"lk","Sudan":"sd","Sweden":"se","Switzerland":"ch","Syria":"sy",
    "Taiwan":"tw","Tanzania":"tz","Thailand":"th","Tunisia":"tn","Turkey":"tr","Turkmenistan":"tm","Uganda":"ug","Ukraine":"ua","United Arab Emirates":"ae","United Kingdom":"gb","United States":"us","Uruguay":"uy","Uzbekistan":"uz",
    "Venezuela":"ve","Vietnam":"vn","Yemen":"ye","Zambia":"zm","Zimbabwe":"zw",
  };

  // Approximate country center as % of equirectangular map [x%, y%]
  const countryCoords: Record<string, [number, number]> = {
    "in":[68.5,40],"us":[22,38],"gb":[48,28],"de":[52,30],"fr":[50,32],"ca":[20,30],"au":[82,72],
    "br":[32,60],"cn":[75,38],"jp":[82,36],"kr":[79,36],"ru":[65,30],"za":[55,70],"ng":[52,50],
    "eg":[56,42],"sa":[60,42],"ae":[62,42],"pk":[66,38],"bd":[70,42],"id":[76,52],"my":[74,50],
    "sg":[74,51],"th":[73,46],"vn":[75,46],"ph":[78,48],"mx":[18,42],"ar":[30,72],"cl":[28,68],
    "co":[26,50],"pe":[24,56],"it":[52,34],"es":[48,34],"nl":[51,29],"se":[54,24],"no":[52,22],
    "pl":[54,30],"tr":[58,36],"il":[58,38],"ke":[58,52],"et":[58,48],"gh":[49,50],"tz":[58,56],
    "ua":[56,30],"fi":[55,22],"dk":[52,28],"be":[51,30],"at":[53,31],"ch":[52,31],"ie":[47,28],
    "pt":[47,35],"nz":[88,76],"lk":[69,48],"np":[68,40],"mm":[72,44],"kz":[64,32],
  };

  const worldMapData = useMemo(() => {
    const map: Record<string, number> = {};
    pageViews.forEach(pv => {
      if (!pv.country) return;
      const code = countryNameToCode[pv.country] || pv.country.toLowerCase().slice(0, 2);
      map[code] = (map[code] || 0) + 1;
    });
    return Object.entries(map).map(([country, value]) => ({ country, value }));
  }, [pageViews]);

  const liveMapDots = useMemo(() => {
    const fiveMinAgo = subMinutes(now, 5);
    const recentViews = pageViews.filter(pv => isAfter(new Date(pv.created_at), fiveMinAgo) && pv.country);
    const seen = new Set<string>();
    const dots: { x: number; y: number; city: string; country: string; isNew: boolean }[] = [];
    for (const pv of recentViews) {
      const code = countryNameToCode[pv.country] || pv.country.toLowerCase().slice(0, 2);
      const key = `${code}-${pv.city}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const coords = countryCoords[code];
      if (!coords) continue;
      const jitter = (pv.city?.length || 0) % 5;
      dots.push({
        x: coords[0] + (jitter - 2) * 0.8,
        y: coords[1] + (jitter - 2) * 0.6,
        city: pv.city || pv.country,
        country: pv.country,
        isNew: (Date.now() - new Date(pv.created_at).getTime()) < 60000,
      });
    }
    return dots;
  }, [pageViews, now]);

  const sessionsByDevice = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    pageViews.forEach(pv => {
      const d = pv.device_type || "desktop";
      if (!map[d]) map[d] = new Set();
      map[d].add(pv.session_id);
    });
    return Object.entries(map)
      .map(([device, sessions]) => ({ name: device, value: sessions.size }))
      .sort((a, b) => b.value - a.value);
  }, [pageViews]);

  const sessionsByBrowser = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    pageViews.forEach(pv => {
      const b = pv.browser || "Unknown";
      if (!map[b]) map[b] = new Set();
      map[b].add(pv.session_id);
    });
    return Object.entries(map)
      .map(([browser, sessions]) => ({ name: browser, value: sessions.size }))
      .sort((a, b) => b.value - a.value);
  }, [pageViews]);

  const sessionsByOS = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    pageViews.forEach(pv => {
      const o = pv.os || "Unknown";
      if (!map[o]) map[o] = new Set();
      map[o].add(pv.session_id);
    });
    return Object.entries(map)
      .map(([os, sessions]) => ({ name: os, value: sessions.size }))
      .sort((a, b) => b.value - a.value);
  }, [pageViews]);

  const topPages = useMemo(() => {
    const map: Record<string, number> = {};
    pageViews.forEach(pv => { map[pv.page_path] = (map[pv.page_path] || 0) + 1; });
    return Object.entries(map)
      .map(([page, views]) => ({ page, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8);
  }, [pageViews]);

  const topReferrers = useMemo(() => {
    const map: Record<string, number> = {};
    pageViews.forEach(pv => {
      let ref = "Direct";
      if (pv.referrer) {
        try { ref = new URL(pv.referrer).hostname; } catch { ref = pv.referrer; }
      }
      map[ref] = (map[ref] || 0) + 1;
    });
    return Object.entries(map)
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [pageViews]);

  const deviceIcon = (type: string) => {
    if (type === "mobile") return <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />;
    if (type === "tablet") return <Tablet className="w-3.5 h-3.5 text-muted-foreground" />;
    return <Monitor className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const maxLoc = sessionsByLocation[0]?.count || 1;
  const maxPage = topPages[0]?.views || 1;

  const timeAgo = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const exportCSV = () => {
    const headers = ["Date", "Page", "Session", "Device", "Browser", "OS", "Country", "Region", "City", "Referrer"];
    const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = pageViews.map(pv => [
      format(new Date(pv.created_at), "yyyy-MM-dd HH:mm:ss"),
      pv.page_path, pv.session_id, pv.device_type,
      pv.browser, pv.os, pv.country, pv.region,
      pv.city, pv.referrer || "Direct",
    ].map(escape).join(","));
    const csvString = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvString], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${dateRange}-${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const summaryHTML = `<h2>Summary</h2><table><tr><td><strong>Total Views</strong></td><td>${pageViews.length}</td></tr><tr><td><strong>Unique Sessions</strong></td><td>${uniqueSessions}</td></tr><tr><td><strong>Pages / Session</strong></td><td>${avgPagesPerSession}</td></tr><tr><td><strong>Date Range</strong></td><td>${dateRange}</td></tr></table>`;
    const pagesHTML = topPages.length ? `<h2>Top Pages</h2><table><tr><th>Page</th><th>Views</th></tr>${topPages.map(p => `<tr><td>${p.page}</td><td>${p.views}</td></tr>`).join("")}</table>` : "";
    const locHTML = sessionsByLocation.length ? `<h2>Top Locations</h2><table><tr><th>Location</th><th>Sessions</th></tr>${sessionsByLocation.map(l => `<tr><td>${l.location}</td><td>${l.count}</td></tr>`).join("")}</table>` : "";
    const devHTML = sessionsByDevice.length ? `<h2>Devices</h2><table><tr><th>Device</th><th>Sessions</th></tr>${sessionsByDevice.map(d => `<tr><td>${d.name}</td><td>${d.value}</td></tr>`).join("")}</table>` : "";
    const browHTML = sessionsByBrowser.length ? `<h2>Browsers</h2><table><tr><th>Browser</th><th>Sessions</th></tr>${sessionsByBrowser.map(b => `<tr><td>${b.name}</td><td>${b.value}</td></tr>`).join("")}</table>` : "";
    const refHTML = topReferrers.length ? `<h2>Top Referrers</h2><table><tr><th>Referrer</th><th>Count</th></tr>${topReferrers.map(r => `<tr><td>${r.referrer}</td><td>${r.count}</td></tr>`).join("")}</table>` : "";
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Analytics Report - ${dateRange}</title><style>body{font-family:system-ui,sans-serif;padding:40px;color:#1a1a2e;max-width:800px;margin:auto}h1{font-size:22px;border-bottom:2px solid #1a1a2e;padding-bottom:8px}h2{font-size:16px;margin-top:28px;color:#555}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:13px}th{background:#f5f5f5;font-weight:600}.meta{color:#888;font-size:12px}</style></head><body><h1>📊 Analytics Report</h1><p class="meta">Generated: ${format(new Date(), "PPpp")} · Range: ${dateRange}</p>${summaryHTML}${pagesHTML}${locHTML}${devHTML}${browHTML}${refHTML}</body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
          <BarChart3 className="w-7 h-7 text-primary" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary/20 animate-ping" />
      </div>
      <p className="text-sm text-muted-foreground font-body animate-pulse">Loading analytics...</p>
    </div>
  );

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Analytics</h1>
            <p className="text-xs text-muted-foreground">{pageViews.length} views · {uniqueSessions} sessions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-[11px] gap-1.5 border-border/40">
                <Download className="w-3.5 h-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCSV} className="gap-2 text-xs">
                <FileDown className="w-3.5 h-3.5" /> Excel/CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPDF} className="gap-2 text-xs">
                <FileText className="w-3.5 h-3.5" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[110px] text-[11px] h-8 border-border/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <AdminPageGuide
        title="Analytics Dashboard"
        description="Track real-time visitors, page views, device breakdown and top traffic sources across your store."
        steps={[
          { text: "Select a date range — Today, Last 7/30/90 days — from the top-right dropdown." },
          { text: "Review the visitor trend chart, device pie chart, and top-pages table below." },
          { text: "Use the Export button to download raw CSV data for offline analysis or reporting." },
        ]}
        tips={[
          "High bounce on a product page? Check image quality and pricing vs. competitors.",
          "Mobile share > 60%? Prioritise mobile UX improvements.",
          "Low session depth? Check if the homepage hero is driving clicks.",
        ]}
      />

      {/* AI Summary Card removed per request — kept the component
          definition above in case we want to bring it back, just not
          rendered. Saves an LLM call on every analytics-page open. */}

      {/* Live visitors hero */}
      <div className="rounded-xl bg-gradient-to-br from-primary to-pink-dark p-4 text-primary-foreground shadow-button">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-foreground/15 flex items-center justify-center">
              <Wifi className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-medium text-primary-foreground/70 uppercase tracking-wider">Live Visitors</p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-primary-foreground/80 bg-primary-foreground/10 px-2 py-0.5 rounded-full">
            <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
          </div>
        </div>
        <p className="text-3xl font-display font-black tracking-tight">{liveVisitorCount}</p>
        <p className="text-[10px] text-primary-foreground/60 mt-1">Active in the last 5 minutes</p>

        {/* Live feed */}
        {liveViews.length > 0 && (
          <div className="mt-3 pt-3 border-t border-primary-foreground/10">
            <p className="text-[9px] font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Recent Activity
            </p>
            <div className="space-y-1 max-h-[140px] overflow-y-auto">
              {liveViews.slice(0, 8).map((v, i) => (
                <div key={v.id} className="flex items-center gap-2 text-[10px] py-1 px-1.5 rounded-md hover:bg-primary-foreground/5">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${i === 0 ? "bg-success animate-pulse" : "bg-primary-foreground/30"}`} />
                  <span className="font-mono truncate flex-1 text-primary-foreground/80">{v.page_path}</span>
                  {v.city && <span className="text-primary-foreground/50 shrink-0 flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{v.city}</span>}
                  <span className="text-primary-foreground/40 shrink-0 w-12 text-right">{timeAgo(v.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {liveViews.length === 0 && (
          <div className="mt-3 pt-3 border-t border-primary-foreground/10 text-center">
            <p className="text-[10px] text-primary-foreground/50 py-2">Waiting for live activity...</p>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: "Total Views", value: pageViews.length.toLocaleString(), icon: Eye },
          { label: "Unique Sessions", value: uniqueSessions.toLocaleString(), icon: Users },
          { label: "Pages / Session", value: avgPagesPerSession, icon: Layers },
          { label: "Top Page", value: topPages[0]?.page || "—", sub: `${topPages[0]?.views || 0} views`, icon: TrendingUp, small: true },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-card border border-border/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                <stat.icon className="w-4 h-4 text-accent-foreground" />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground leading-tight">{stat.label}</span>
            </div>
            <p className={`font-display font-black text-foreground ${stat.small ? "text-sm truncate" : "text-xl"}`}>{stat.value}</p>
            {stat.sub && <p className="text-[9px] text-muted-foreground mt-0.5">{stat.sub}</p>}
          </div>
        ))}
      </div>

      {/* World Map with Live Dots */}
      <div className="bg-card rounded-xl border border-border/40 p-3.5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
            <Map className="w-3 h-3 text-primary" /> Visitor Map
          </h3>
          {liveMapDots.length > 0 && (
            <span className="text-[9px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {liveMapDots.length} live
            </span>
          )}
        </div>
        {worldMapData.length > 0 ? (
          <MapContainer worldMapData={worldMapData} liveMapDots={liveMapDots} />
        ) : (
          <EmptyState icon={Globe} />
        )}
        {worldMapData.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="flex flex-wrap gap-2">
              {worldMapData.sort((a, b) => b.value - a.value).slice(0, 6).map((d) => (
                <div key={d.country} className="flex items-center gap-1.5 bg-accent/50 rounded-md px-2 py-1">
                  <span className="text-[10px] font-bold text-foreground uppercase">{d.country}</span>
                  <span className="text-[9px] text-muted-foreground">{d.value} views</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sessions & Views chart */}
      <div className="bg-card rounded-xl border border-border/40 p-3.5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-primary" /> Sessions & Views
          </h3>
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-primary rounded-full inline-block" /> Sessions</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-muted-foreground/40 rounded-full inline-block" /> Views</span>
          </div>
        </div>
        {sessionsOverTime.length > 0 ? (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sessionsOverTime}>
                <defs>
                  <linearGradient id="sessionGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} className="text-muted-foreground" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} className="text-muted-foreground" axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                <Area type="monotone" dataKey="sessions" stroke="hsl(var(--primary))" fill="url(#sessionGrad)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                <Area type="monotone" dataKey="views" stroke="hsl(var(--muted-foreground))" fill="transparent" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon={BarChart3} />
        )}
      </div>

      {/* Device breakdown */}
      <div className="bg-card rounded-xl border border-border/40 p-3.5">
        <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5 mb-3">
          <Monitor className="w-3 h-3 text-primary" /> Device Breakdown
        </h3>
        {sessionsByDevice.length > 0 ? (
          <div>
            <div className="h-[160px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sessionsByDevice} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={4} dataKey="value" stroke="none">
                    {sessionsByDevice.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 mt-2">
              {sessionsByDevice.map((d, idx) => (
                <div key={d.name} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  {deviceIcon(d.name)}
                  <span className="flex-1 capitalize text-foreground">{d.name}</span>
                  <span className="font-bold text-foreground">{d.value}</span>
                  <span className="text-muted-foreground w-8 text-right">
                    {uniqueSessions > 0 ? `${Math.round((d.value / uniqueSessions) * 100)}%` : "0%"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState icon={Smartphone} />
        )}
      </div>

      {/* Locations */}
      <div className="bg-card rounded-xl border border-border/40 p-3.5">
        <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5 mb-3">
          <Globe className="w-3 h-3 text-primary" /> Top Locations
        </h3>
        {sessionsByLocation.length > 0 ? (
          <div className="space-y-2">
            {sessionsByLocation.map((loc, i) => (
              <div key={loc.location}>
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                    <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate text-foreground">{loc.location}</span>
                  </span>
                  <span className="font-bold text-foreground ml-2 shrink-0">{loc.count}</span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden ml-4.5">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(loc.count / maxLoc) * 100}%`, opacity: 1 - i * 0.08 }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Globe} />
        )}
      </div>

      {/* Top Pages */}
      <div className="bg-card rounded-xl border border-border/40 p-3.5">
        <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5 mb-3">
          <FileText className="w-3 h-3 text-primary" /> Top Pages
        </h3>
        {topPages.length > 0 ? (
          <div className="space-y-2">
            {topPages.map((p, i) => (
              <div key={p.page}>
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                    <span className="w-4 h-4 rounded bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground shrink-0">{i + 1}</span>
                    <span className="font-mono truncate text-foreground">{p.page}</span>
                  </span>
                  <span className="font-bold text-foreground ml-2 shrink-0">{p.views}</span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden ml-5">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(p.views / maxPage) * 100}%`, opacity: 1 - i * 0.08 }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={FileText} />
        )}
      </div>

      {/* Browser & OS */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-card rounded-xl border border-border/40 p-3.5">
          <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5 mb-3">
            <Chrome className="w-3 h-3 text-primary" /> Browsers
          </h3>
          {sessionsByBrowser.length > 0 ? (
            <div className="space-y-1.5">
              {sessionsByBrowser.map((b, idx) => (
                <div key={b.name} className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="flex-1 truncate text-foreground">{b.name}</span>
                  <span className="font-bold text-foreground">{b.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[9px] text-muted-foreground text-center py-3">No data</p>
          )}
        </div>
        <div className="bg-card rounded-xl border border-border/40 p-3.5">
          <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5 mb-3">
            <Compass className="w-3 h-3 text-primary" /> OS
          </h3>
          {sessionsByOS.length > 0 ? (
            <div className="space-y-1.5">
              {sessionsByOS.map((o, idx) => (
                <div key={o.name} className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[(idx + 2) % COLORS.length] }} />
                  <span className="flex-1 truncate text-foreground">{o.name}</span>
                  <span className="font-bold text-foreground">{o.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[9px] text-muted-foreground text-center py-3">No data</p>
          )}
        </div>
      </div>

      {/* Referrers */}
      <div className="bg-card rounded-xl border border-border/40 p-3.5">
        <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5 mb-3">
          <ArrowUpRight className="w-3 h-3 text-primary" /> Top Referrers
        </h3>
        {topReferrers.length > 0 ? (
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topReferrers} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="referrer" tick={{ fontSize: 9 }} width={60} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon={ArrowUpRight} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
      <Icon className="w-6 h-6 mb-1.5 opacity-20" />
      <p className="text-[10px]">No data available</p>
    </div>
  );
}
