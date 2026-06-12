/**
 * /admin/assets — Admin Asset Library.
 * Admin-only management view for ALL persisted image assets.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Download,
  Loader2,
  Trash2,
  Archive,
  Sparkles,
  CheckCircle2,
  XCircle,
  ImageOff,
  RefreshCw,
  FolderPlus,
  Folder,
  Pencil,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Info,
} from "lucide-react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { deleteFromGallery } from "@/lib/gallery";
import {
  getBaseAssetUrl,
  getEnhancedAssetUrl,
  getMasterAssetUrl,
  getMasterDimensions,
  getPrintReadiness,
  type AssetImageLike,
} from "@/lib/image-assets";
import {
  estimateGenerationCost,
  estimateUpscaleCost,
  formatCost,
} from "@/lib/admin-asset-cost";
import { useUpscale } from "@/hooks/use-upscale";
import {
  getUpscaleOptionsForSurface,
  UPSCALE_MODES,
  type UpscaleMode,
} from "@/lib/upscale-modes";
import {
  assessUpscaleSuitability,
  type UpscaleSuitability,
} from "@/lib/upscale-suitability";

import { getModelById } from "@/lib/generation-providers/registry";

type AdminStatus = "draft" | "needs_review" | "approved" | "rejected" | "archived";

interface AssetFolder {
  id: string;
  name: string;
  description: string | null;
  deleted_at: string | null;
}

interface CostEvent {
  id: string;
  generated_image_id: string;
  event_type: string;
  provider: string | null;
  model: string | null;
  mode: string | null;
  estimated_cost: number | null;
  currency: string;
  status: string;
  metadata: any;
  created_at: string;
}

interface AssetRow extends AssetImageLike {
  id: string;
  prompt: string;
  mode: string;
  aspect_ratio: string;
  created_at: string;
  upscaled_at?: string | null;
  generation_provider?: string | null;
  generation_model?: string | null;
  execution_route?: string | null;
  print_format_id?: string | null;
  upscale_mode?: string | null;
  upscale_method?: string | null;
  enhancement_model?: string | null;
  admin_status?: AdminStatus | null;
  deleted_at?: string | null;
  folder_id?: string | null;
  requested_model_id?: string | null;
  resolved_model_id?: string | null;
  selected_adapter_id?: string | null;
  quality_profile?: string | null;
  generation_strategy?: string | null;
  model_fallback_reason?: string | null;
}

const STATUS_OPTIONS: { value: AdminStatus | "all"; label: string }[] = [
  { value: "all", label: "All (excl. archived)" },
  { value: "draft", label: "Draft" },
  { value: "needs_review", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

const statusBadgeVariant: Record<AdminStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  needs_review: "secondary",
  approved: "default",
  rejected: "destructive",
  archived: "outline",
};

// Upscale modes that can be triggered from admin (gallery surface)
const ADMIN_UPSCALE_MODES = getUpscaleOptionsForSurface("gallery");

function shortPrompt(p: string | null | undefined, len = 60): string {
  if (!p) return "Untitled";
  const s = p.replace(/\s+/g, " ").trim();
  return s.length > len ? s.slice(0, len) + "…" : s;
}

async function downloadUrl(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function upscaleModeLabel(mode: string | null | undefined): string {
  if (!mode) return "Unknown";
  const cfg = (UPSCALE_MODES as any)[mode] as
    | { label: string }
    | undefined;
  return cfg?.label ?? mode;
}

export default function AdminAssets() {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [readinessFilter, setReadinessFilter] = useState<string>("all");
  // Honor a `?status=needs_review` (etc.) query param so /review can deep-link here.
  const [searchParams] = useSearchParams();
  const initialStatus = (() => {
    const s = searchParams.get("status");
    return s && ["draft", "needs_review", "approved", "rejected", "archived"].includes(s)
      ? s
      : "all";
  })();
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [hasUpscaledFilter, setHasUpscaledFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [upscalingId, setUpscalingId] = useState<string | null>(null);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [costRefreshTick, setCostRefreshTick] = useState(0);

  const upscaler = useUpscale();

  const loadFolders = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("asset_folders")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) {
      console.warn("Folders load failed:", error.message);
      return;
    }
    setFolders((data || []) as AssetFolder[]);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("generated_images")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const mapped = (data || []).map((img: any) => {
        const masterPath = img.master_storage_path || img.storage_path;
        const url = (p: string | null) =>
          p ? supabase.storage.from("generated-images").getPublicUrl(p).data.publicUrl : null;
        return {
          ...img,
          publicUrl: url(img.storage_path),
          masterUrl: url(masterPath),
          enhancedUrl: url(img.enhanced_storage_path),
        } as AssetRow;
      });
      setRows(mapped);
    } catch (err: any) {
      toast.error("Failed to load assets", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows();
    loadFolders();
  }, [loadRows, loadFolders]);

  /* ---------------- Derived data ---------------- */

  const providers = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const p = r.generation_provider || r.execution_route;
      if (p) set.add(p);
    });
    return Array.from(set).sort();
  }, [rows]);

  const folderById = useMemo(() => {
    const m = new Map<string, AssetFolder>();
    folders.forEach((f) => m.set(f.id, f));
    return m;
  }, [folders]);

  const filtered = useMemo(() => {
    let out = rows.slice();
    const s = search.trim().toLowerCase();
    if (s) {
      out = out.filter(
        (r) =>
          r.id.toLowerCase().includes(s) ||
          (r.prompt || "").toLowerCase().includes(s) ||
          (r.generation_provider || "").toLowerCase().includes(s) ||
          (r.mode || "").toLowerCase().includes(s),
      );
    }
    if (providerFilter !== "all") {
      out = out.filter(
        (r) => (r.generation_provider || r.execution_route) === providerFilter,
      );
    }
    if (statusFilter === "all") {
      out = out.filter((r) => (r.admin_status || "draft") !== "archived");
    } else {
      out = out.filter((r) => (r.admin_status || "draft") === statusFilter);
    }
    if (folderFilter === "none") {
      out = out.filter((r) => !r.folder_id);
    } else if (folderFilter !== "all") {
      out = out.filter((r) => r.folder_id === folderFilter);
    }
    if (hasUpscaledFilter === "yes") {
      out = out.filter((r) => !!r.enhanced_storage_path);
    } else if (hasUpscaledFilter === "no") {
      out = out.filter((r) => !r.enhanced_storage_path);
    }
    if (readinessFilter !== "all") {
      out = out.filter((r) => {
        const lvl = getPrintReadiness(r, r.print_format_id).level;
        return lvl === readinessFilter;
      });
    }

    switch (sortBy) {
      case "oldest":
        out.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
        break;
      case "provider":
        out.sort((a, b) =>
          (a.generation_provider || "").localeCompare(b.generation_provider || ""),
        );
        break;
      case "cost": {
        const totalCost = (r: AssetRow) =>
          (estimateGenerationCost(r.generation_provider, r.execution_route) || 0) +
          (estimateUpscaleCost(r.upscale_mode, r.upscale_method, r.enhancement_model) || 0);
        out.sort((a, b) => totalCost(b) - totalCost(a));
        break;
      }
      case "dimensions": {
        const px = (r: AssetRow) => {
          const d = getMasterDimensions(r);
          return d ? d.width * d.height : 0;
        };
        out.sort((a, b) => px(b) - px(a));
        break;
      }
      case "newest":
      default:
        out.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
    return out;
  }, [
    rows,
    search,
    providerFilter,
    statusFilter,
    folderFilter,
    hasUpscaledFilter,
    readinessFilter,
    sortBy,
  ]);

  /* ---------------- Summary stats ---------------- */

  const summary = useMemo(() => {
    let total = 0;
    let printReady = 0;
    let withMaster = 0;
    let withWeb = 0;
    let missingMeta = 0;
    let genCost = 0;
    let upCost = 0;
    rows.forEach((r) => {
      total++;
      const readiness = getPrintReadiness(r, r.print_format_id);
      if (readiness.level === "ready-300" || readiness.level === "ready-150") printReady++;
      if (r.enhanced_storage_path || r.master_storage_path) withMaster++;
      if (r.storage_path) withWeb++;
      if (!getMasterDimensions(r) || !r.generation_provider) missingMeta++;
      const g = estimateGenerationCost(r.generation_provider, r.execution_route);
      if (g) genCost += g;
      const u = estimateUpscaleCost(r.upscale_mode, r.upscale_method, r.enhancement_model);
      if (u) upCost += u;
    });
    return { total, printReady, withMaster, withWeb, missingMeta, genCost, upCost };
  }, [rows]);

  /* ---------------- Actions ---------------- */

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  };

  const updateStatus = async (id: string, status: AdminStatus) => {
    const { error } = await supabase
      .from("generated_images")
      .update({ admin_status: status } as any)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update status", { description: error.message });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, admin_status: status } : r)));
    toast.success(`Status updated to ${status.replace("_", " ")}`);
  };

  const bulkUpdateStatus = async (status: AdminStatus) => {
    if (!selected.size) return;
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("generated_images")
      .update({ admin_status: status } as any)
      .in("id", ids);
    if (error) {
      toast.error("Bulk update failed", { description: error.message });
      return;
    }
    setRows((prev) =>
      prev.map((r) => (ids.includes(r.id) ? { ...r, admin_status: status } : r)),
    );
    toast.success(`${ids.length} assets updated`);
    setSelected(new Set());
  };

  const setAssetFolder = async (id: string, folderId: string | null) => {
    const { error } = await supabase
      .from("generated_images")
      .update({ folder_id: folderId } as any)
      .eq("id", id);
    if (error) {
      toast.error("Failed to set folder", { description: error.message });
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, folder_id: folderId } : r)),
    );
    toast.success(folderId ? "Moved to folder" : "Removed from folder");
  };

  const bulkSetFolder = async (folderId: string | null) => {
    if (!selected.size) return;
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("generated_images")
      .update({ folder_id: folderId } as any)
      .in("id", ids);
    if (error) {
      toast.error("Bulk move failed", { description: error.message });
      return;
    }
    setRows((prev) =>
      prev.map((r) => (ids.includes(r.id) ? { ...r, folder_id: folderId } : r)),
    );
    toast.success(`${ids.length} assets moved`);
    setSelected(new Set());
  };

  const handleDelete = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    try {
      await deleteFromGallery(id, row.storage_path || "");
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Asset deleted");
    } catch (err: any) {
      toast.error("Delete failed", { description: err?.message });
    } finally {
      setDeleteId(null);
    }
  };

  const handleBulkDelete = async () => {
    setBusy(true);
    const ids = Array.from(selected);
    let ok = 0;
    for (const id of ids) {
      const r = rows.find((x) => x.id === id);
      if (!r) continue;
      try {
        await deleteFromGallery(id, r.storage_path || "");
        ok++;
      } catch {
        /* skip */
      }
    }
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelected(new Set());
    setBusy(false);
    setBulkDeleteOpen(false);
    toast.success(`Deleted ${ok} assets`);
  };

  const handleUpscale = async (row: AssetRow, mode: UpscaleMode) => {
    const source = getBaseAssetUrl(row);
    if (!source) {
      toast.error("No base image available to upscale");
      return;
    }
    if (mode === "none") return;

    // Snapshot pre-state for cost-event diff metadata.
    const prevDims = getMasterDimensions(row);
    const prevReadiness = getPrintReadiness(row, row.print_format_id).level;

    setUpscalingId(row.id);
    const startedAt = new Date().toISOString();
    try {
      const result = await upscaler.upscale(source, {
        galleryImageId: row.id,
        mode,
      });
      const cfg = UPSCALE_MODES[mode];
      const estCost = estimateUpscaleCost(mode, mode, cfg.provider);

      // Reload from DB so new master/enhanced paths and dims are picked up
      // (updateEnhancedAsset is called inside useUpscale on the sync path,
      // upscale-webhook persists for async).
      await loadRows();

      // Compute new readiness against the freshly-loaded row (via closure
      // over latest rows list inside setRows/loadRows is messy — re-fetch
      // once for the diff snapshot only).
      let newDims = prevDims;
      let newReadiness = prevReadiness;
      try {
        const { data: fresh } = await supabase
          .from("generated_images")
          .select(
            "enhanced_width_px,enhanced_height_px,actual_width_px,actual_height_px,base_width_px,base_height_px,print_format_id",
          )
          .eq("id", row.id)
          .maybeSingle();
        if (fresh) {
          const freshLike = fresh as any;
          newDims = getMasterDimensions(freshLike) || prevDims;
          newReadiness = getPrintReadiness(
            freshLike,
            freshLike.print_format_id,
          ).level;
        }
      } catch {
        /* best-effort */
      }

      // Best-effort cost/history event with diff metadata.
      // For async upscales the webhook is the source of truth and may have
      // already inserted a row with this job_id by the time the poller
      // resolves. Skip insert if a matching webhook event already exists to
      // avoid duplicates.
      try {
        let skipInsert = false;
        if (result?.async && result.jobId) {
          const since = new Date(
            Date.now() - 2 * 60 * 60 * 1000,
          ).toISOString();
          const { data: existing } = await (supabase as any)
            .from("asset_cost_events")
            .select("id, metadata")
            .eq("generated_image_id", row.id)
            .eq("event_type", "upscale")
            .eq("mode", mode)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(5);
          if (
            (existing || []).some(
              (e: any) => e?.metadata?.job_id === result.jobId,
            )
          ) {
            skipInsert = true;
          }
        }
        if (!skipInsert) {
          await (supabase as any).from("asset_cost_events").insert({
            generated_image_id: row.id,
            event_type: "upscale",
            provider: cfg.provider,
            model: cfg.provider,
            mode,
            estimated_cost: result ? estCost : null,
            currency: "USD",
            status: result ? "succeeded" : "failed",
            metadata: {
              started_at: startedAt,
              label: cfg.label,
              previous_dimensions: prevDims
                ? { width: prevDims.width, height: prevDims.height }
                : null,
              new_dimensions: newDims
                ? { width: newDims.width, height: newDims.height }
                : null,
              previous_print_readiness: prevReadiness,
              new_print_readiness: newReadiness,
              scale: result?.scale ?? cfg.scaleFactor,
              job_id: result?.jobId ?? null,
              async: result?.async ?? false,
              source: "frontend",
            },
          });
        }
      } catch {
        /* swallow — cost logging is best-effort */
      }

      // Refresh the in-modal cost history without closing the modal.
      setCostRefreshTick((t) => t + 1);

      if (result) {
        toast.success(`Upscale complete (${cfg.shortLabel})`);
      } else {
        toast.error("Upscale failed");
      }
    } catch (err: any) {
      toast.error("Upscale failed", { description: err?.message });
      try {
        const cfg = UPSCALE_MODES[mode];
        await (supabase as any).from("asset_cost_events").insert({
          generated_image_id: row.id,
          event_type: "upscale",
          provider: cfg.provider,
          mode,
          estimated_cost: null,
          status: "failed",
          metadata: { error: String(err?.message || err) },
        });
        setCostRefreshTick((t) => t + 1);
      } catch {
        /* swallow */
      }
    } finally {
      setUpscalingId(null);
    }
  };

  const handleBulkZip = async (variant: "master" | "base" | "web") => {
    if (!selected.size) return;
    setBusy(true);
    const zip = new JSZip();
    let included = 0;
    let skipped = 0;
    for (const id of selected) {
      const r = rows.find((x) => x.id === id);
      if (!r) continue;
      const url =
        variant === "master"
          ? getMasterAssetUrl(r)
          : variant === "base"
            ? getBaseAssetUrl(r)
            : r.publicUrl;
      if (!url) {
        skipped++;
        continue;
      }
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        zip.file(`${r.id}-${variant}.png`, blob);
        included++;
      } catch {
        skipped++;
      }
    }
    if (included === 0) {
      toast.error("No files available");
      setBusy(false);
      return;
    }
    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = `assets-${variant}-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    setBusy(false);
    toast.success(`Downloaded ${included} files`, {
      description: skipped ? `${skipped} skipped (no ${variant} version)` : undefined,
    });
  };

  /* ---------------- Render ---------------- */

  const detailIndex = detailId ? filtered.findIndex((r) => r.id === detailId) : -1;
  const detailRow = detailIndex >= 0 ? filtered[detailIndex] : null;
  const detailScrollRef = useRef<HTMLDivElement | null>(null);

  const goToDetail = useCallback(
    (delta: number) => {
      if (detailIndex < 0) return;
      const next = detailIndex + delta;
      if (next < 0 || next >= filtered.length) return;
      setDetailId(filtered[next].id);
      requestAnimationFrame(() => {
        detailScrollRef.current?.scrollTo({ top: 0 });
      });
    },
    [detailIndex, filtered],
  );

  useEffect(() => {
    if (!detailRow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToDetail(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToDetail(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailRow, goToDetail]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">Admin Asset Library</h1>
              <p className="text-sm text-muted-foreground">
                All persisted image assets across the system
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setFoldersOpen(true)}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Asset folders
            </Button>
            <Button variant="outline" size="sm" onClick={loadRows} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <SummaryCard label="Total assets" value={summary.total} />
          <SummaryCard label="Print-ready" value={summary.printReady} />
          <SummaryCard label="With master" value={summary.withMaster} />
          <SummaryCard label="With web" value={summary.withWeb} />
          <SummaryCard label="Missing metadata" value={summary.missingMeta} />
          <SummaryCard label="Est. gen cost" value={formatCost(summary.genCost)} />
          <SummaryCard label="Est. upscale cost" value={formatCost(summary.upCost)} />
        </div>

        {/* Filter bar */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ID, prompt, provider…"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  {providers.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={folderFilter} onValueChange={setFolderFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All folders</SelectItem>
                  <SelectItem value="none">No folder</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={readinessFilter} onValueChange={setReadinessFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Print quality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All quality</SelectItem>
                  <SelectItem value="ready-300">300 PPI</SelectItem>
                  <SelectItem value="ready-150">150 PPI</SelectItem>
                  <SelectItem value="soft">Soft</SelectItem>
                  <SelectItem value="too-small">Too small</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
              <Select value={hasUpscaledFilter} onValueChange={setHasUpscaledFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Upscaled" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any version</SelectItem>
                  <SelectItem value="yes">Has master</SelectItem>
                  <SelectItem value="no">No master</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="provider">Provider</SelectItem>
                  <SelectItem value="cost">Cost (high→low)</SelectItem>
                  <SelectItem value="dimensions">Resolution</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bulk action bar */}
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground mr-2">
                  {selected.size} selected
                </span>
                <Button size="sm" variant="outline" onClick={() => handleBulkZip("master")} disabled={busy}>
                  <Download className="h-4 w-4 mr-1" /> Print ZIP
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkZip("web")} disabled={busy}>
                  <Download className="h-4 w-4 mr-1" /> Web ZIP
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkZip("base")} disabled={busy}>
                  <Download className="h-4 w-4 mr-1" /> Original ZIP
                </Button>
                <Select onValueChange={(v) => bulkSetFolder(v === "__none__" ? null : v)}>
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue placeholder="Move to folder…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No folder</SelectItem>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("approved")}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("rejected")}>
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
                <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("archived")}>
                  <Archive className="h-4 w-4 mr-1" /> Archive
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Asset grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <ImageOff className="h-10 w-10 mx-auto mb-3 opacity-50" />
              No assets match the current filters.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={selected.size === filtered.length && filtered.length > 0}
                onCheckedChange={toggleAll}
              />
              <span className="text-sm text-muted-foreground">
                Select all ({filtered.length})
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((row) => (
                <AssetCard
                  key={row.id}
                  row={row}
                  folder={row.folder_id ? folderById.get(row.folder_id) ?? null : null}
                  selected={selected.has(row.id)}
                  onToggleSelect={() => toggleSelect(row.id)}
                  onOpenDetail={() => setDetailId(row.id)}
                  upscaling={upscalingId === row.id}
                  onStatusChange={(s) => updateStatus(row.id, s)}
                  onDelete={() => setDeleteId(row.id)}
                  onUpscale={(m) => handleUpscale(row, m)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detail dialog — scrollable on all viewports */}
      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>Asset details</DialogTitle>
              {detailRow && filtered.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {detailIndex + 1} of {filtered.length}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => goToDetail(-1)}
                    disabled={detailIndex <= 0}
                    title="Previous (←)"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => goToDetail(1)}
                    disabled={detailIndex >= filtered.length - 1}
                    title="Next (→)"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
          {detailRow && (
            <div ref={detailScrollRef} className="flex-1 overflow-y-auto px-6 py-4">
              <AssetDetail
                key={detailRow.id}
                row={detailRow}
                folders={folders}
                upscaling={upscalingId === detailRow.id}
                costRefreshTick={costRefreshTick}
                onUpscale={(m) => handleUpscale(detailRow, m)}
                onStatusChange={(s) => updateStatus(detailRow.id, s)}
                onSetFolder={(fid) => setAssetFolder(detailRow.id, fid)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ManageFoldersDialog
        open={foldersOpen}
        onOpenChange={setFoldersOpen}
        folders={folders}
        reload={loadFolders}
      />

      {/* Single delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the database record and all storage files for this asset. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {selected.size} assets?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the database records and all storage files for the selected assets. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground"
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============================================================== */
/* Sub-components                                                 */
/* ============================================================== */

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function UpscaleControl({
  onRun,
  upscaling,
  size = "sm",
}: {
  onRun: (m: UpscaleMode) => void;
  upscaling: boolean;
  size?: "sm" | "default";
}) {
  const defaultMode: UpscaleMode =
    (ADMIN_UPSCALE_MODES[0]?.id as UpscaleMode) || "realesrgan_4x";
  const [mode, setMode] = useState<UpscaleMode>(defaultMode);
  const cfg = UPSCALE_MODES[mode];
  return (
    <div className="flex items-stretch gap-2">
      <Select value={mode} onValueChange={(v) => setMode(v as UpscaleMode)}>
        <SelectTrigger className={size === "sm" ? "h-8 text-xs" : ""}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ADMIN_UPSCALE_MODES.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="secondary"
        size={size}
        onClick={() => onRun(mode)}
        disabled={upscaling}
        className="whitespace-nowrap"
      >
        {upscaling ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-2" />
        )}
        Run {cfg.shortLabel}
      </Button>
    </div>
  );
}

function AssetCard({
  row,
  folder,
  selected,
  onToggleSelect,
  onOpenDetail,
  onUpscale,
  upscaling,
  onStatusChange,
  onDelete,
}: {
  row: AssetRow;
  folder: AssetFolder | null;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
  onUpscale: (m: UpscaleMode) => void;
  upscaling: boolean;
  onStatusChange: (s: AdminStatus) => void;
  onDelete: () => void;
}) {
  const dims = getMasterDimensions(row);
  const readiness = getPrintReadiness(row, row.print_format_id);
  const hasMaster = !!row.enhanced_storage_path || !!row.master_storage_path;
  const status = (row.admin_status || "draft") as AdminStatus;
  const provider = row.generation_provider || row.execution_route || "unknown";
  const genCost = estimateGenerationCost(row.generation_provider, row.execution_route);
  const upCost = estimateUpscaleCost(row.upscale_mode, row.upscale_method, row.enhancement_model);
  const total = (genCost || 0) + (upCost || 0);
  const fileMissing = !row.publicUrl;

  return (
    <Card className="overflow-hidden group relative">
      <div className="absolute top-2 left-2 z-10">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="bg-background" />
      </div>
      <div
        role="button"
        onClick={onOpenDetail}
        className="aspect-square bg-muted relative cursor-pointer overflow-hidden"
      >
        {fileMissing ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <ImageOff className="h-8 w-8 mb-1" />
            <span className="text-xs">File unavailable</span>
          </div>
        ) : (
          <img
            src={row.publicUrl!}
            alt={shortPrompt(row.prompt, 40)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          <Badge variant={statusBadgeVariant[status]} className="capitalize">
            {status.replace("_", " ")}
          </Badge>
          {hasMaster && <Badge variant="secondary">Master</Badge>}
          {folder && (
            <Badge variant="outline" className="bg-background/80">
              <Folder className="h-3 w-3 mr-1" />
              {folder.name}
            </Badge>
          )}
        </div>
      </div>
      <CardContent className="p-3 space-y-2">
        <div className="text-sm font-medium truncate" title={row.prompt}>
          {shortPrompt(row.prompt, 50)}
        </div>
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          <span>{provider}</span>
          <span>·</span>
          <span>{row.aspect_ratio || "?"}</span>
          {dims && (
            <>
              <span>·</span>
              <span>
                {dims.width}×{dims.height}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <Badge variant="outline" className="text-[10px]">
            {readiness.level === "unknown"
              ? "Unknown quality"
              : `${readiness.achievablePpi ?? "?"} PPI`}
          </Badge>
          <span className="text-muted-foreground">
            {total > 0 ? formatCost(total) : "—"}
          </span>
        </div>
        <Separator />
        <div className="flex items-center gap-1">
          <Select value={status} onValueChange={(v) => onStatusChange(v as AdminStatus)}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive"
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <UpscaleControl onRun={onUpscale} upscaling={upscaling} />
      </CardContent>
    </Card>
  );
}

function AssetDetail({
  row,
  folders,
  upscaling,
  costRefreshTick,
  onUpscale,
  onStatusChange,
  onSetFolder,
}: {
  row: AssetRow;
  folders: AssetFolder[];
  upscaling: boolean;
  costRefreshTick: number;
  onUpscale: (m: UpscaleMode) => void;
  onStatusChange: (s: AdminStatus) => void;
  onSetFolder: (folderId: string | null) => void;
}) {
  const baseUrl = getBaseAssetUrl(row);
  const enhancedUrl = getEnhancedAssetUrl(row);
  const masterUrl = getMasterAssetUrl(row);
  const dims = getMasterDimensions(row);
  const readiness = getPrintReadiness(row, row.print_format_id);
  const status = (row.admin_status || "draft") as AdminStatus;
  const genCost = estimateGenerationCost(row.generation_provider, row.execution_route);
  const upCost = estimateUpscaleCost(row.upscale_mode, row.upscale_method, row.enhancement_model);
  const suitability = useMemo<UpscaleSuitability>(
    () => assessUpscaleSuitability(row),
    [row],
  );

  // Confirmation gate for low / not-needed runs.
  const [pendingMode, setPendingMode] = useState<UpscaleMode | null>(null);

  const requestUpscale = useCallback(
    (mode: UpscaleMode) => {
      if (suitability.level === "low" || suitability.level === "not-needed") {
        setPendingMode(mode);
        return;
      }
      onUpscale(mode);
    },
    [suitability.level, onUpscale],
  );

  // Cost / action history events
  const [events, setEvents] = useState<CostEvent[] | null>(null);
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("asset_cost_events")
        .select("*")
        .eq("generated_image_id", row.id)
        .order("created_at", { ascending: true });
      if (cancel) return;
      if (error) {
        console.warn("history load failed:", error.message);
        setEvents([]);
      } else {
        setEvents((data || []) as CostEvent[]);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [row.id, costRefreshTick]);

  // Total known cost: sum of recorded events plus any known metadata cost
  // for which there is NO matching event row, to avoid double-counting.
  const eventTotals = useMemo(() => {
    if (!events) return { sum: 0, hasGenEvent: false, hasUpscaleEvent: false };
    let sum = 0;
    let hasGenEvent = false;
    let hasUpscaleEvent = false;
    events.forEach((e) => {
      if (e.status === "succeeded" && typeof e.estimated_cost === "number") {
        sum += Number(e.estimated_cost);
      }
      if (e.event_type === "generation" && e.status === "succeeded") hasGenEvent = true;
      if (e.event_type === "upscale" && e.status === "succeeded") hasUpscaleEvent = true;
    });
    return { sum, hasGenEvent, hasUpscaleEvent };
  }, [events]);

  const totalKnown = useMemo(() => {
    let total = eventTotals.sum;
    if (!eventTotals.hasGenEvent && genCost) total += genCost;
    if (!eventTotals.hasUpscaleEvent && upCost) total += upCost;
    return total > 0 ? total : null;
  }, [eventTotals, genCost, upCost]);

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="col-span-2 break-all">{value ?? <span className="text-muted-foreground">Unknown</span>}</div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div className="aspect-square bg-muted rounded overflow-hidden">
          {masterUrl ? (
            <img src={masterUrl} alt={row.prompt} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <ImageOff className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Button
            variant="default"
            disabled={!masterUrl}
            onClick={() =>
              masterUrl && downloadUrl(masterUrl, `${row.id}-print.png`)
            }
          >
            <Download className="h-4 w-4 mr-2" />
            {masterUrl ? "Download print version" : "No upscaled version available"}
          </Button>
          <Button
            variant="outline"
            disabled={!row.publicUrl}
            onClick={() =>
              row.publicUrl && downloadUrl(row.publicUrl, `${row.id}-web.png`)
            }
          >
            <Download className="h-4 w-4 mr-2" />
            Download web version
          </Button>
          <Button
            variant="outline"
            disabled={!baseUrl}
            onClick={() => baseUrl && downloadUrl(baseUrl, `${row.id}-original.png`)}
          >
            <Download className="h-4 w-4 mr-2" />
            Download original
          </Button>
          <div className="border rounded-md p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Run upscale
            </div>
            <SuitabilityCard suitability={suitability} alreadyUpscaled={!!row.upscale_applied || !!row.enhanced} />
            <UpscaleControl onRun={requestUpscale} upscaling={upscaling} size="default" />
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Status</div>
          <Select value={status} onValueChange={(v) => onStatusChange(v as AdminStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Folder</div>
          <Select
            value={row.folder_id ?? "__none__"}
            onValueChange={(v) => onSetFolder(v === "__none__" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="No folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No folder</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Separator />
        <div>
          <h4 className="text-sm font-semibold mb-2">Specifications</h4>
          <Field label="Asset ID" value={<code className="text-xs">{row.id}</code>} />
          <Field label="Created" value={new Date(row.created_at).toLocaleString()} />
          <Field
            label="Upscaled"
            value={row.upscaled_at ? new Date(row.upscaled_at).toLocaleString() : null}
          />
          <Field label="Provider" value={row.generation_provider} />
          <Field label="Model" value={row.generation_model} />
          <Field label="Execution route" value={row.execution_route} />
          <Field label="Style/mode" value={row.mode} />
          <Field label="Aspect ratio" value={row.aspect_ratio} />
          <Field label="Print format" value={row.print_format_id} />
          <Field
            label="Base size"
            value={
              row.base_width_px && row.base_height_px
                ? `${row.base_width_px} × ${row.base_height_px}`
                : null
            }
          />
          <Field
            label="Master size"
            value={dims ? `${dims.width} × ${dims.height} (${dims.origin})` : null}
          />
          <Field
            label="Print readiness"
            value={
              <span>
                {readiness.summary}
                {readiness.recommendation && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {readiness.recommendation}
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground/80 mt-1 italic">
                  Print readiness is based on dimensions/PPI. Compare original
                  and enhanced versions visually before final print.
                </div>
              </span>
            }
          />
          <Field
            label="Upscale mode"
            value={row.upscale_mode ? upscaleModeLabel(row.upscale_mode) : null}
          />
          <Field label="Enhancement model" value={row.enhancement_model} />
        </div>
        {(row.requested_model_id ||
          row.resolved_model_id ||
          row.selected_adapter_id ||
          row.quality_profile ||
          row.generation_strategy ||
          row.model_fallback_reason) && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-semibold mb-2">Model selection</h4>
              <Field
                label="Requested model"
                value={
                  row.requested_model_id
                    ? getModelById(row.requested_model_id)?.displayName ||
                      row.requested_model_id
                    : null
                }
              />
              <Field
                label="Resolved model"
                value={
                  row.resolved_model_id
                    ? getModelById(row.resolved_model_id)?.displayName ||
                      row.resolved_model_id
                    : null
                }
              />
              <Field label="Adapter" value={row.selected_adapter_id} />
              <Field label="Quality profile" value={row.quality_profile} />
              <Field label="Strategy" value={row.generation_strategy} />
              {row.model_fallback_reason && (
                <Field
                  label="Fallback reason"
                  value={
                    <span className="text-orange-500">
                      {row.model_fallback_reason}
                    </span>
                  }
                />
              )}
            </div>
          </>
        )}
        <Separator />
        <div>
          <h4 className="text-sm font-semibold mb-2">Cost &amp; history</h4>
          <Field label="Generation cost" value={formatCost(genCost)} />
          <Field label="Upscaling cost" value={formatCost(upCost)} />
          <Field
            label="Total known cost"
            value={totalKnown != null ? formatCost(totalKnown) : "Unknown"}
          />
          <Field label="Recorded events" value={events ? String(events.length) : "…"} />

          <div className="mt-3 space-y-2">
            {events == null ? (
              <div className="text-xs text-muted-foreground">Loading history…</div>
            ) : events.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No detailed history available for this asset. Showing known cost
                metadata only.
              </div>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li
                    key={e.id}
                    className="border rounded-md p-2 text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">
                        {e.event_type}
                        {e.mode ? ` · ${upscaleModeLabel(e.mode)}` : ""}
                      </span>
                      <span className="text-muted-foreground">
                        {e.estimated_cost != null
                          ? `${e.currency} ${formatCost(Number(e.estimated_cost))}`
                          : "Unknown cost"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                      <span>{new Date(e.created_at).toLocaleString()}</span>
                      {(e.provider || e.model) && (
                        <span>{e.provider || e.model}</span>
                      )}
                      <span className="capitalize">{e.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <Separator />
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Prompt
          </summary>
          <pre className="text-xs whitespace-pre-wrap bg-muted p-3 rounded mt-2 max-h-60 overflow-auto">
            {row.prompt || "(no prompt)"}
          </pre>
        </details>
      </div>

      {/* Confirm low / not-needed upscale */}
      <AlertDialog
        open={pendingMode !== null}
        onOpenChange={(o) => !o && setPendingMode(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suitability.level === "not-needed"
                ? "This image already appears print-ready"
                : "Limited benefit expected"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suitability.level === "not-needed"
                ? "Upscaling may add artifacts without visible gain. Continue?"
                : "This image may not visually improve after upscaling. Continue?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const m = pendingMode;
                setPendingMode(null);
                if (m) onUpscale(m);
              }}
            >
              Continue anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const SUITABILITY_STYLE: Record<
  UpscaleSuitability["level"],
  { label: string; cls: string; icon: React.ReactNode }
> = {
  high: {
    label: "Good candidate",
    cls: "bg-primary/10 text-primary border-primary/30",
    icon: <Sparkles className="h-3 w-3" />,
  },
  medium: {
    label: "May help",
    cls: "bg-orange-500/10 text-orange-500 border-orange-500/30",
    icon: <Info className="h-3 w-3" />,
  },
  low: {
    label: "Limited benefit",
    cls: "bg-muted text-muted-foreground border-border",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  "not-needed": {
    label: "Not needed",
    cls: "bg-muted text-muted-foreground border-border",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  unknown: {
    label: "Unknown",
    cls: "bg-muted text-muted-foreground border-border",
    icon: <Info className="h-3 w-3" />,
  },
};

function SuitabilityCard({
  suitability,
  alreadyUpscaled,
}: {
  suitability: UpscaleSuitability;
  alreadyUpscaled: boolean;
}) {
  const s = SUITABILITY_STYLE[suitability.level];
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border font-medium ${s.cls}`}
        >
          {s.icon}
          {s.label}
        </span>
        {suitability.effectivePpi != null && (
          <span className="text-muted-foreground tabular-nums">
            ~{suitability.effectivePpi} PPI
          </span>
        )}
      </div>
      <div className="text-foreground/90 leading-snug">{suitability.title}</div>
      {suitability.reasons.length > 0 && (
        <ul className="text-muted-foreground leading-snug list-disc pl-4 space-y-0.5">
          {suitability.reasons.slice(0, 2).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {suitability.riskFlags.length > 0 && (
        <ul className="text-orange-500/90 leading-snug list-disc pl-4 space-y-0.5">
          {suitability.riskFlags.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <div className="text-muted-foreground/80 italic">
        {suitability.recommendation}
      </div>
      {alreadyUpscaled && suitability.level !== "unknown" && (
        <div className="text-[11px] text-muted-foreground">
          Note: this asset already has an enhanced master.
        </div>
      )}
    </div>
  );
}

/* ---------------- Manage folders dialog ---------------- */

function ManageFoldersDialog({
  open,
  onOpenChange,
  folders,
  reload,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  folders: AssetFolder[];
  reload: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const { error } = await (supabase as any)
      .from("asset_folders")
      .insert({ name: newName.trim() });
    setBusy(false);
    if (error) {
      toast.error("Create failed", { description: error.message });
      return;
    }
    setNewName("");
    await reload();
    toast.success("Folder created");
  };

  const rename = async (id: string, name: string) => {
    if (!name.trim()) return;
    const { error } = await (supabase as any)
      .from("asset_folders")
      .update({ name: name.trim() })
      .eq("id", id);
    if (error) {
      toast.error("Rename failed", { description: error.message });
      return;
    }
    setEditing(null);
    await reload();
    toast.success("Folder renamed");
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any)
      .from("asset_folders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Archive failed", { description: error.message });
      return;
    }
    await reload();
    toast.success("Folder archived");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Asset folders</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          <div className="flex gap-2">
            <Input
              placeholder="New folder name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
            <Button onClick={create} disabled={busy || !newName.trim()}>
              <FolderPlus className="h-4 w-4 mr-1" /> Create
            </Button>
          </div>
          {folders.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No folders yet.
            </div>
          ) : (
            <ul className="space-y-1">
              {folders.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 border rounded-md px-3 py-2"
                >
                  {editing?.id === f.id ? (
                    <>
                      <Input
                        value={editing.name}
                        onChange={(e) =>
                          setEditing({ id: f.id, name: e.target.value })
                        }
                        className="h-8"
                      />
                      <Button size="sm" onClick={() => rename(f.id, editing.name)}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm">{f.name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditing({ id: f.id, name: f.name })}
                        title="Rename"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => remove(f.id)}
                        title="Archive folder"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
