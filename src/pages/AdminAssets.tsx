/**
 * /admin/assets — Admin Asset Library.
 *
 * Central management view for ALL persisted image assets in the system.
 *
 * IMAGE LIFECYCLE SUMMARY (for context):
 *   - Only EXPLICITLY SAVED images are persisted (via saveToGallery).
 *   - Generated previews held only in component state are NOT persisted.
 *   - Files live in Supabase Storage bucket `generated-images` (public).
 *   - Metadata lives in `public.generated_images`.
 *   - Asset roles: storage_path (base) → enhanced_storage_path (upscale)
 *     → master_storage_path (best). original_storage_path preserves the
 *     pre-enhancement source for re-processing.
 *   - Upscaling is done via the existing `useUpscale` hook (Replicate +
 *     async webhooks). We REUSE that pipeline here unchanged.
 *
 * This page is admin-only and reuses the existing tables, storage, and
 * upscale pipeline — no duplicate asset system.
 */
import { useEffect, useMemo, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { fetchGalleryImages, deleteFromGallery } from "@/lib/gallery";
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

type AdminStatus = "draft" | "needs_review" | "approved" | "rejected" | "archived";

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
}

const STATUS_OPTIONS: { value: AdminStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
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

export default function AdminAssets() {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [readinessFilter, setReadinessFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hasUpscaledFilter, setHasUpscaledFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [upscalingId, setUpscalingId] = useState<string | null>(null);

  const upscaler = useUpscale();

  const loadRows = async () => {
    setLoading(true);
    try {
      // Reuse fetchGalleryImages — but we need ALL rows, including older ones.
      // fetchGalleryImages limits to 50, so query directly here.
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
  };

  useEffect(() => {
    loadRows();
  }, []);

  /* ---------------- Derived data ---------------- */

  const providers = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const p = r.generation_provider || r.execution_route;
      if (p) set.add(p);
    });
    return Array.from(set).sort();
  }, [rows]);

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
    if (statusFilter !== "all") {
      out = out.filter((r) => (r.admin_status || "draft") === statusFilter);
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
      next.has(id) ? next.delete(id) : next.add(id);
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

  const handleUpscale = async (row: AssetRow) => {
    const source = getBaseAssetUrl(row);
    if (!source) {
      toast.error("No base image available to upscale");
      return;
    }
    setUpscalingId(row.id);
    try {
      const result = await upscaler.upscale(source, {
        galleryImageId: row.id,
        mode: "realesrgan_4x",
      });
      if (result) {
        toast.success("Upscale complete");
        await loadRows();
      } else {
        toast.error("Upscale failed");
      }
    } catch (err: any) {
      toast.error("Upscale failed", { description: err?.message });
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

  const detailRow = detailId ? rows.find((r) => r.id === detailId) : null;

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
          <Button variant="outline" size="sm" onClick={loadRows} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
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
                  selected={selected.has(row.id)}
                  onToggleSelect={() => toggleSelect(row.id)}
                  onOpenDetail={() => setDetailId(row.id)}
                  onUpscale={() => handleUpscale(row)}
                  upscaling={upscalingId === row.id}
                  onStatusChange={(s) => updateStatus(row.id, s)}
                  onDelete={() => setDeleteId(row.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Asset details</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <ScrollArea className="flex-1">
              <AssetDetail
                row={detailRow}
                onUpscale={() => handleUpscale(detailRow)}
                upscaling={upscalingId === detailRow.id}
                onStatusChange={(s) => updateStatus(detailRow.id, s)}
              />
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

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

function AssetCard({
  row,
  selected,
  onToggleSelect,
  onOpenDetail,
  onUpscale,
  upscaling,
  onStatusChange,
  onDelete,
}: {
  row: AssetRow;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
  onUpscale: () => void;
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
  const masterUrl = getMasterAssetUrl(row);

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
            className="h-8 w-8"
            onClick={onUpscale}
            disabled={upscaling}
            title="Upscale"
          >
            {upscaling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
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
      </CardContent>
    </Card>
  );
}

function AssetDetail({
  row,
  onUpscale,
  upscaling,
  onStatusChange,
}: {
  row: AssetRow;
  onUpscale: () => void;
  upscaling: boolean;
  onStatusChange: (s: AdminStatus) => void;
}) {
  const baseUrl = getBaseAssetUrl(row);
  const enhancedUrl = getEnhancedAssetUrl(row);
  const masterUrl = getMasterAssetUrl(row);
  const dims = getMasterDimensions(row);
  const readiness = getPrintReadiness(row, row.print_format_id);
  const status = (row.admin_status || "draft") as AdminStatus;
  const genCost = estimateGenerationCost(row.generation_provider, row.execution_route);
  const upCost = estimateUpscaleCost(row.upscale_mode, row.upscale_method, row.enhancement_model);

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="col-span-2 break-all">{value ?? <span className="text-muted-foreground">Unknown</span>}</div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
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
          <Button variant="secondary" onClick={onUpscale} disabled={upscaling}>
            {upscaling ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Run upscale
          </Button>
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
              </span>
            }
          />
          <Field label="Upscale mode" value={row.upscale_mode} />
          <Field label="Enhancement model" value={row.enhancement_model} />
          <Field label="Generation cost" value={formatCost(genCost)} />
          <Field label="Upscale cost" value={formatCost(upCost)} />
          <Field
            label="Total cost"
            value={formatCost((genCost || 0) + (upCost || 0) || null)}
          />
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
    </div>
  );
}
