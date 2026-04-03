import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Style configs (read-only, shared across all invocations) ──

const STYLE_CONFIGS: Record<string, { prompt: string[] }> = {};

const RAW_STYLES: Record<string, { visualGoal: string[]; styleAnchors: string[]; style: string[]; composition: string[]; color: string[]; quality: string[]; avoid: string[] }> = {
  japanese: {
    visualGoal: ["authentic museum-quality ukiyo-e woodblock print", "feels like a genuine Edo period artwork"],
    styleAnchors: ["traditional Japanese ukiyo-e woodblock print", "Hokusai and Hiroshige aesthetic"],
    style: ["flat color areas with bold black outlines", "sumi ink details", "layered depth through overlapping planes"],
    composition: ["asymmetric balance", "foreground/middle/background layers", "dramatic negative space"],
    color: ["limited palette of 5-8 traditional pigment colors", "no gradients — flat blocks only"],
    quality: ["museum-quality woodblock print", "crisp registration", "high detail", "sharp rendering", "clean edges", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "soft gradients", "any text or script"],
  },
  freestyle: {
    visualGoal: ["ukiyo-e woodblock print applied to any subject", "premium art print aesthetic"],
    styleAnchors: ["ukiyo-e woodblock print art style", "Japanese printmaking applied to modern subjects"],
    style: ["flat colors with bold outlines", "sumi ink details", "woodblock print aesthetic"],
    composition: ["centered or asymmetric balance", "clear subject with defined background"],
    color: ["rich limited traditional palette", "flat color blocks"],
    quality: ["museum-quality reproduction", "crisp lines", "high detail", "sharp rendering", "clean edges", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "gradients", "any text or script"],
  },
  popart: {
    visualGoal: ["bold gallery-quality pop art print", "Warhol/Lichtenstein level graphic impact"],
    styleAnchors: ["Andy Warhol screen-print aesthetic", "Roy Lichtenstein comic panel style"],
    style: ["Ben-Day dots", "thick black outlines", "flat high-contrast colors", "comic book aesthetic"],
    composition: ["strong central subject", "graphic poster layout", "clear figure-ground separation"],
    color: ["vibrant saturated CMYK palette", "high contrast", "no subtle tones"],
    quality: ["crisp halftone dots", "clean outlines", "professional screen-print quality", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "soft pastels", "gradients", "any text or script"],
  },
  "popart-freestyle": {
    visualGoal: ["vibrant pop art illustration with graphic punch", "street-poster quality artwork"],
    styleAnchors: ["pop art visual language", "comic book and screen-print aesthetics"],
    style: ["Ben-Day dots, thick outlines, vivid colors", "comic book aesthetics"],
    composition: ["graphic composition", "strong central focus"],
    color: ["vibrant saturated colors", "high contrast bold palette"],
    quality: ["clean outlines", "crisp details", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "soft shading", "any text or script"],
  },
  lineart: {
    visualGoal: ["museum-quality pen-and-ink illustration", "fine art engraving-level detail"],
    styleAnchors: ["fine pen-and-ink illustration", "Victorian engraving tradition"],
    style: ["hatching and cross-hatching", "varying line weights", "stippling", "engraving quality"],
    composition: ["detailed focal subject", "depth through line density", "balanced space"],
    color: ["black ink on white only — monochrome", "tonal range through line density"],
    quality: ["botanical precision", "consistent line quality", "high detail", "sharp rendering", "clean edges", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["color fills", "solid black areas", "cartoon style", "any text or script"],
  },
  "lineart-freestyle": {
    visualGoal: ["elegant pen-and-ink artwork", "premium illustration-quality line drawing"],
    styleAnchors: ["fine pen-and-ink line art", "elegant ink illustration tradition"],
    style: ["delicate ink lines with hatching", "varying weights"],
    composition: ["clear subject with detail", "depth through line density"],
    color: ["black ink on white — monochrome"],
    quality: ["consistent crisp linework", "fine detail", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["color", "cartoon style", "any text or script"],
  },
  "lineart-minimal": {
    visualGoal: ["gallery-quality minimal line art", "Picasso single-line drawing elegance"],
    styleAnchors: ["ultra-minimal continuous line drawing", "Picasso's single-line drawings"],
    style: ["fewest lines possible", "single-weight thin black line", "one-line art style"],
    composition: ["centered with maximum negative space", "every line essential"],
    color: ["single black line on white — nothing else"],
    quality: ["smooth continuous line", "elegant confident strokes", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["multiple line weights", "shading", "unnecessary detail", "any text or script"],
  },
  minimalism: {
    visualGoal: ["elegant minimalist illustration", "premium poster aesthetic", "gallery-ready minimal art"],
    styleAnchors: ["minimalist poster design", "Scandinavian design aesthetic", "Swiss graphic design"],
    style: ["clean geometric forms", "precise vector-like edges", "flat design"],
    composition: ["centered or rule-of-thirds", "generous negative space", "perfectly balanced"],
    color: ["limited 2-4 muted colors", "no gradients", "high contrast"],
    quality: ["pixel-perfect edges", "professional poster quality", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["clip-art", "visual clutter", "excessive detail", "more than 4 colors", "any text"],
  },
  "minimalism-freestyle": {
    visualGoal: ["clean minimalist artwork", "modern design poster quality"],
    styleAnchors: ["minimalist art style", "Scandinavian design aesthetic"],
    style: ["clean simplified forms", "geometric shapes", "flat design"],
    composition: ["generous negative space", "balanced minimal layout"],
    color: ["limited muted palette of 2-4 colors"],
    quality: ["precise clean edges", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["visual clutter", "excessive detail", "any text"],
  },
  graffiti: {
    visualGoal: ["authentic urban street art mural", "gallery-quality graffiti artwork"],
    styleAnchors: ["urban street art graffiti", "Banksy/KAWS inspired", "spray paint mural tradition"],
    style: ["spray paint with drips", "bold outlines", "stencil elements"],
    composition: ["dynamic asymmetric layout", "subject fills frame", "layered depth"],
    color: ["neon saturated spray paint colors", "fluorescent accents", "color bleeding"],
    quality: ["realistic spray paint texture", "authentic wall texture", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["clean digital look", "soft pastels", "formal composition", "any readable text"],
  },
  "graffiti-freestyle": {
    visualGoal: ["vibrant street art illustration", "urban energy captured in art"],
    styleAnchors: ["graffiti and urban street art", "spray paint mural aesthetic"],
    style: ["spray paint effects", "urban energy"],
    composition: ["dynamic energetic layout"],
    color: ["vibrant neon tones", "spray paint palette"],
    quality: ["authentic spray texture", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["clean digital aesthetic", "muted tones", "any text"],
  },
  botanical: {
    visualGoal: ["museum-quality scientific botanical illustration", "natural history art collection worthy"],
    styleAnchors: ["scientific botanical illustration", "Redouté/Haeckel tradition"],
    style: ["watercolor with ink outlines", "accurate botanical detail"],
    composition: ["specimen-style centered", "multiple views if appropriate"],
    color: ["soft natural watercolor palette", "transparent layered washes"],
    quality: ["museum-quality natural history art", "delicate brushwork", "fine ink detail", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "digital gradients", "any text or labels", "cartoonish plants"],
  },
  "botanical-freestyle": {
    visualGoal: ["artistic botanical watercolor artwork", "elegant natural history illustration"],
    styleAnchors: ["botanical watercolor illustration", "scientific accuracy with artistic flair"],
    style: ["delicate washes and ink outlines", "scientific accuracy with artistic expression"],
    composition: ["elegant natural arrangement"],
    color: ["natural watercolor palette", "transparent washes"],
    quality: ["museum-quality art", "fine detail", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "any text or labels"],
  },
  urbannoir: {
    visualGoal: ["gritty black-and-white urban print", "raw documentary street photography feel"],
    styleAnchors: ["gritty black and white street photography", "analog film look", "heavy grain", "high contrast", "monochrome street print"],
    style: ["strictly monochrome", "heavy film grain", "high contrast", "raw documentary aesthetic"],
    composition: ["urban street-level perspective", "dynamic framing", "subject fills frame"],
    color: ["strictly black and white — no color", "full tonal range", "grain as texture"],
    quality: ["authentic analog film grain", "sharp detail", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["any color", "clean digital look", "soft aesthetics", "any text or script"],
  },
  "urbannoir-freestyle": {
    visualGoal: ["raw monochrome urban art print", "underground street aesthetic"],
    styleAnchors: ["gritty black and white photography", "analog film grain", "underground zine print"],
    style: ["strictly monochrome with heavy grain", "high contrast analog film look"],
    composition: ["dynamic urban-energy framing", "subject-forward with gritty texture"],
    color: ["black and white only", "deep blacks and bright whites"],
    quality: ["authentic film grain quality", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["any color", "clean digital aesthetic", "any text or script"],
  },
  screenprint: {
    visualGoal: ["authentic vintage screen-printed poster", "retro merch aesthetic"],
    styleAnchors: ["vintage screen print poster", "halftone texture", "ink bleed", "limited colors"],
    style: ["halftone dots", "ink bleed", "limited 3-5 spot colors", "bold graphic shapes", "worn print texture"],
    composition: ["bold poster composition", "strong central graphic", "layered ink impression"],
    color: ["limited spot colors — max 5", "slightly desaturated retro tones"],
    quality: ["authentic screen print quality", "visible ink texture", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "smooth digital gradients", "any text or script"],
  },
  "screenprint-freestyle": {
    visualGoal: ["retro screen print art applied to any subject"],
    styleAnchors: ["vintage screen print style", "halftone and ink bleed texture"],
    style: ["halftone dots, ink bleed, limited colors", "bold graphic simplification"],
    composition: ["poster-style bold layout", "strong graphic presence"],
    color: ["limited spot color palette", "retro tones"],
    quality: ["authentic print texture", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "smooth gradients", "any text or script"],
  },
  risograph: {
    visualGoal: ["authentic risograph print artwork", "indie art poster"],
    styleAnchors: ["risograph print", "layered spot colors", "grainy ink texture", "slight misregistration"],
    style: ["visible grain", "layered spot colors with overlap", "slight misregistration", "bold simplified forms"],
    composition: ["bold graphic composition", "simplified forms", "layered color planes"],
    color: ["limited 2-4 riso ink colors", "color overlap mixing", "warm paper base"],
    quality: ["authentic risograph texture", "visible ink layering", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "smooth digital rendering", "any text or script"],
  },
  "risograph-freestyle": {
    visualGoal: ["risograph print style applied to any subject"],
    styleAnchors: ["risograph print aesthetic", "grainy layered inks", "bold simplified forms"],
    style: ["grainy ink texture", "slight misregistration", "bold graphic simplification"],
    composition: ["bold poster layout", "simplified graphic forms"],
    color: ["limited spot colors", "overlap mixing"],
    quality: ["authentic riso print quality", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "smooth rendering", "any text or script"],
  },
  retrocomic: {
    visualGoal: ["classic retro comic book print panel", "vintage pulp comic quality"],
    styleAnchors: ["retro comic print", "halftone dots", "bold ink outlines", "vintage comic colors"],
    style: ["bold black ink outlines", "halftone dot shading", "vintage four-color palette", "aged paper feel"],
    composition: ["dynamic action composition", "strong figure-ground separation", "panel-like framing"],
    color: ["vintage CMYK palette", "halftone mid-tones", "warm aged paper base"],
    quality: ["crisp bold outlines", "consistent halftones", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "smooth gradients", "modern digital comic", "any text or script"],
  },
  "retrocomic-freestyle": {
    visualGoal: ["retro comic print style applied to any subject"],
    styleAnchors: ["retro comic book style", "halftone dots and bold outlines"],
    style: ["bold ink outlines", "halftone shading", "vintage color process"],
    composition: ["dynamic graphic composition", "figure-ground separation"],
    color: ["vintage CMYK palette", "halftone dots"],
    quality: ["crisp outlines and halftones", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "smooth rendering", "any text or script"],
  },
  pulpmagazine: {
    visualGoal: ["dramatic vintage pulp magazine cover illustration"],
    styleAnchors: ["pulp magazine cover", "dramatic composition", "painted cover art", "strong shadows"],
    style: ["dramatic painted illustration", "rich gouache rendering", "strong chiaroscuro", "vintage techniques"],
    composition: ["dramatic diagonal composition", "strong central figure", "cinematic depth"],
    color: ["rich saturated vintage palette", "warm tones with cool shadow accents"],
    quality: ["professional painted illustration", "visible brushwork", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "flat design", "any text or script"],
  },
  "pulpmagazine-freestyle": {
    visualGoal: ["pulp illustration style applied to any subject"],
    styleAnchors: ["pulp magazine illustration", "dramatic painted cover art"],
    style: ["dramatic painted illustration", "strong chiaroscuro lighting"],
    composition: ["dramatic cinematic composition", "strong central subject"],
    color: ["rich saturated vintage palette"],
    quality: ["professional painted quality", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "flat design", "any text or script"],
  },
  tattooflash: {
    visualGoal: ["authentic traditional tattoo flash sheet illustration"],
    styleAnchors: ["traditional tattoo flash", "bold black outlines", "flat limited colors", "flash sheet design"],
    style: ["bold thick outlines", "flat solid color fills", "classic American traditional vocabulary", "iconic composition"],
    composition: ["centered iconic presentation", "clean graphic isolation", "symmetry and balance"],
    color: ["limited tattoo palette: red, green, yellow, blue, black", "flat fills", "cream paper background"],
    quality: ["crisp bold outlines", "clean flat fills", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "soft gradients", "modern realism tattoo", "any text or script"],
  },
  "tattooflash-freestyle": {
    visualGoal: ["tattoo flash style applied to any subject"],
    styleAnchors: ["traditional tattoo flash style", "bold outlines and flat colors"],
    style: ["bold thick outlines", "flat solid fills", "graphic icon composition"],
    composition: ["centered iconic presentation", "clean graphic isolation"],
    color: ["limited traditional tattoo colors", "flat fills"],
    quality: ["crisp bold outlines", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "soft gradients", "any text or script"],
  },
  brutalistposter: {
    visualGoal: ["harsh bold brutalist poster design", "raw contemporary graphic art"],
    styleAnchors: ["brutalist poster design", "stark contrast", "heavy black shapes", "modern print aesthetic"],
    style: ["heavy bold shapes", "stark contrasts", "raw energy", "asymmetric layout", "industrial aesthetic"],
    composition: ["bold asymmetric layout", "heavy visual weight", "dramatic scale contrasts"],
    color: ["stark high-contrast — black + 1-2 accent colors", "no subtle tones"],
    quality: ["crisp bold edges", "professional print quality", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["photorealism", "soft aesthetics", "decorative ornament", "any text or script"],
  },
  "brutalistposter-freestyle": {
    visualGoal: ["brutalist graphic design applied to any subject"],
    styleAnchors: ["brutalist poster design", "stark contrast and bold shapes"],
    style: ["heavy bold shapes", "stark contrast", "industrial aesthetic"],
    composition: ["bold asymmetric layout", "dramatic scale"],
    color: ["high-contrast limited palette"],
    quality: ["crisp graphic edges", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["soft aesthetics", "decorative ornament", "any text or script"],
  },
  xeroxzine: {
    visualGoal: ["authentic photocopied underground zine page", "DIY punk print aesthetic"],
    styleAnchors: ["xerox zine aesthetic", "photocopy texture", "rough black and white", "collage style"],
    style: ["harsh photocopy contrast", "copier noise and grain", "collage energy", "DIY imperfection"],
    composition: ["raw collage layout", "cut-and-paste layering", "intentional imperfection"],
    color: ["strictly black and white — photocopy monochrome", "harsh lost mid-tones"],
    quality: ["authentic photocopy quality", "visible copier artifacts", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["any color", "clean digital rendering", "polished look", "any text or script"],
  },
  "xeroxzine-freestyle": {
    visualGoal: ["xerox zine style applied to any subject"],
    styleAnchors: ["xerox photocopy zine", "rough black and white", "collage punk print"],
    style: ["harsh photocopy contrast", "copier noise", "DIY collage energy"],
    composition: ["raw collage layout", "intentional imperfection"],
    color: ["black and white only", "harsh crushed contrast"],
    quality: ["authentic photocopy quality", "high detail", "sharp rendering", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
    avoid: ["any color", "clean digital look", "any text or script"],
  },
};

const EDGE_SAFETY = "EDGE SAFETY: preserve all intentional inner borders, edge lines, and frame-like details. Do not trim, fade, or blend edge details into the background. Artwork edges are sacred — decorative borders and internal framing elements must remain fully intact.";

// Pre-compile style prompt fragments once at module load (not per request)
for (const [key, cfg] of Object.entries(RAW_STYLES)) {
  STYLE_CONFIGS[key] = {
    prompt: [
      `VISUAL GOAL: ${cfg.visualGoal.join(". ")}`,
      `STYLE ANCHORS: ${cfg.styleAnchors.join(". ")}`,
      `STYLE RULES: ${cfg.style.join(". ")}`,
      `COMPOSITION: ${cfg.composition.join(". ")}`,
      `COLOR: ${cfg.color.join(". ")}`,
      `GLOBAL QUALITY: ${cfg.quality.join(". ")}`,
      EDGE_SAFETY,
      `AVOID: ${cfg.avoid.join(". ")}`,
    ],
  };
}

const VARIATION_INSTRUCTIONS = [
  "alternate composition angle",
  "different lighting direction",
  "slight perspective shift",
  "variation in framing and cropping",
  "different focal emphasis",
];

/** Build a complete prompt. Uses pre-compiled style fragments. */
function buildPrompt(subject: string, mode: string, bg: string, ratio: string, variationIndex: number): string {
  const style = STYLE_CONFIGS[mode];

  const parts = [`PRIMARY SUBJECT: ${subject}`, ""];

  if (style) {
    parts.push(...style.prompt, "");
  } else {
    parts.push("GLOBAL QUALITY: high detail, sharp focus, clean edges, high resolution, detailed textures, professional illustration, sharp rendering, no artifacts, print-ready resolution, suitable for large format printing", "");
    parts.push("EDGE SAFETY: preserve all intentional inner borders, edge lines, and frame-like details. Do not trim, fade, or blend edge details into the background. Artwork edges are sacred — decorative borders and internal framing elements must remain fully intact.", "");
  }

  parts.push(bg, ratio);

  if (variationIndex > 0) {
    parts.push(`VARIATION: Apply ${VARIATION_INSTRUCTIONS[variationIndex % VARIATION_INSTRUCTIONS.length]} while maintaining the same subject and style.`);
  }

  parts.push("Generate at maximum resolution with fine detail suitable for large format printing.");

  return parts.filter(Boolean).join("\n");
}

// ── Concurrency control ──

const CONCURRENCY_FAST = 5;
const CONCURRENCY_QUALITY = 3;

/**
 * Process items with a concurrency-limited pool.
 * Unlike fixed-size batches, a pool starts new work as soon as a slot opens.
 */
async function runPool(
  items: any[],
  concurrency: number,
  worker: (item: any, index: number) => Promise<void>,
  shouldStop: () => Promise<boolean>,
) {
  let nextIdx = 0;
  let activeCount = 0;
  let resolve: () => void;
  const done = new Promise<void>((r) => { resolve = r; });

  async function startNext() {
    while (nextIdx < items.length && activeCount < concurrency) {
      if (await shouldStop()) { if (activeCount === 0) resolve!(); return; }

      const idx = nextIdx++;
      activeCount++;

      worker(items[idx], idx).finally(() => {
        activeCount--;
        if (nextIdx >= items.length && activeCount === 0) {
          resolve!();
        } else {
          startNext();
        }
      });
    }
    if (nextIdx >= items.length && activeCount === 0) resolve!();
  }

  await startNext();
  await done;
}

/** Sync job counters from items — single query, single write. */
async function syncJobCounters(supabase: any, jobId: string) {
  const { data: allItems } = await supabase
    .from("generation_job_items")
    .select("status")
    .eq("job_id", jobId);
  if (!allItems) return;

  const completed = allItems.filter((it: any) => it.status === "completed").length;
  const failed = allItems.filter((it: any) => it.status === "failed").length;

  await supabase
    .from("generation_jobs")
    .update({ completed_images: completed, failed_images: failed, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobId } = await req.json();
    if (!jobId) return new Response(JSON.stringify({ error: "Missing jobId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing environment variables");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: job, error: jobError } = await supabase.from("generation_jobs").select("*").eq("id", jobId).single();
    if (jobError || !job) return new Response(JSON.stringify({ error: "Job not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (job.status === "cancelled" || job.status === "completed") {
      return new Response(JSON.stringify({ status: job.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase
      .from("generation_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .in("status", ["queued", "processing"]);

    const { data: items } = await supabase
      .from("generation_job_items")
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "queued")
      .order("created_at");

    if (!items || items.length === 0) {
      await syncJobCounters(supabase, jobId);
      const { data: finalItems } = await supabase.from("generation_job_items").select("status").eq("job_id", jobId);
      const allDone = finalItems?.every((it: any) => it.status === "completed" || it.status === "failed" || it.status === "cancelled");
      if (allDone) {
        const failed = finalItems?.filter((it: any) => it.status === "failed").length || 0;
        const finalStatus = failed === finalItems?.length ? "failed" : "completed";
        await supabase.from("generation_jobs").update({ status: finalStatus, updated_at: new Date().toISOString() }).eq("id", jobId);
      }
      return new Response(JSON.stringify({ status: "completed", message: "No queued items" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Precompute shared prompt fragments
    const bgText = job.background_style === "cream"
      ? "Use a warm cream/off-white paper background."
      : "The background MUST be pure white (#FFFFFF).";
    const ratioText = job.aspect_ratio ? `The image must have a ${job.aspect_ratio} aspect ratio.` : "";
    const model = job.speed_mode === "fast" ? "google/gemini-3.1-flash-image-preview" : "google/gemini-3-pro-image-preview";
    const concurrency = job.speed_mode === "fast" ? CONCURRENCY_FAST : CONCURRENCY_QUALITY;

    // Debounced counter sync — at most once per 2 seconds
    let syncPending = false;
    let lastSyncTime = 0;
    const debouncedSync = async () => {
      const now = Date.now();
      if (now - lastSyncTime < 2000) {
        if (!syncPending) {
          syncPending = true;
          setTimeout(async () => {
            syncPending = false;
            lastSyncTime = Date.now();
            await syncJobCounters(supabase, jobId);
          }, 2000);
        }
        return;
      }
      lastSyncTime = now;
      await syncJobCounters(supabase, jobId);
    };

    // Cache cancellation status — refresh at most every 3 seconds
    let cancelledCache = false;
    let lastCancelCheck = 0;
    const checkCancelled = async (): Promise<boolean> => {
      if (cancelledCache) return true;
      const now = Date.now();
      if (now - lastCancelCheck < 3000) return cancelledCache;
      lastCancelCheck = now;
      const { data } = await supabase.from("generation_jobs").select("status").eq("id", jobId).single();
      cancelledCache = data?.status === "cancelled";
      return cancelledCache;
    };

    const processItem = async (item: any, itemIndex: number) => {
      if (await checkCancelled()) return;

      // Idempotent transition queued → generating
      const { data: transitioned } = await supabase
        .from("generation_job_items")
        .update({ status: "generating", updated_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("status", "queued")
        .select("id");

      if (!transitioned || transitioned.length === 0) return;

      try {
        const mode = item.style || job.mode;
        const fullPrompt = buildPrompt(item.prompt_variant, mode, bgText, ratioText, itemIndex);

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: fullPrompt }],
            modalities: ["image", "text"],
          }),
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          throw new Error(`AI gateway ${aiResponse.status}: ${errText.slice(0, 200)}`);
        }

        const aiData = await aiResponse.json();
        const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (!imageUrl) throw new Error("No image generated");

        let finalImageUrl = imageUrl;
        // Always run upscale pipeline for maximum quality
        try {
          const upRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-pro-image-preview",
              messages: [{
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: imageUrl } },
                  { type: "text", text: `CRITICAL UPSCALING AND ENHANCEMENT: Sharpen all edges, enhance textures, increase clarity and resolution to maximum quality. Apply subtle denoising to remove compression artifacts. Do NOT change subject, style, composition, or colors. Do NOT crop or reframe. Do NOT alter any borders or frames within the artwork. Do NOT trim, fade, or soften any detail near image edges. All intentional inner borders, edge lines, and frame-like details must be preserved exactly. Maintain ${job.aspect_ratio} aspect ratio. Output must be suitable for large-format print at 300 DPI.` },
                ],
              }],
              modalities: ["image", "text"],
            }),
          });
          if (upRes.ok) {
            const upData = await upRes.json();
            const enhanced = upData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (enhanced) finalImageUrl = enhanced;
          }
        } catch { /* skip upscale on error — use original */ }

        // Upload + gallery save
        const filename = `${mode}-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const base64Data = finalImageUrl.split(",")[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        const { error: uploadError } = await supabase.storage
          .from("generated-images")
          .upload(filename, bytes.buffer, { contentType: "image/png" });
        if (uploadError) throw new Error("Failed to save image to storage");

        const { data: galleryRow } = await supabase
          .from("generated_images")
          .insert({
            prompt: item.prompt_variant,
            mode,
            aspect_ratio: job.aspect_ratio,
            print_size: job.print_size,
            storage_path: filename,
            quality_mode: job.speed_mode === "fast" ? "web" : "quality",
            target_ppi: job.target_ppi || null,
            target_width_px: job.target_width_px || null,
            target_height_px: job.target_height_px || null,
            enhanced: job.hd_enhance || false,
          })
          .select("id")
          .single();

        await supabase
          .from("generation_job_items")
          .update({
            status: "completed",
            image_url: finalImageUrl,
            storage_path: filename,
            gallery_image_id: galleryRow?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .eq("status", "generating");

        await debouncedSync();
      } catch (err: any) {
        console.error(`Item ${item.id} failed:`, err.message);
        await supabase
          .from("generation_job_items")
          .update({
            status: "failed",
            error_message: err.message || "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .in("status", ["queued", "generating"]);

        await debouncedSync();
      }
    };

    // Run with concurrency pool
    await runPool(items, concurrency, processItem, checkCancelled);

    // Final accurate counter sync + status
    if (!cancelledCache) {
      await syncJobCounters(supabase, jobId);

      const { data: finalItems } = await supabase
        .from("generation_job_items")
        .select("status")
        .eq("job_id", jobId);

      const completed = finalItems?.filter((it: any) => it.status === "completed").length || 0;
      const failed = finalItems?.filter((it: any) => it.status === "failed").length || 0;
      const finalStatus = failed === finalItems?.length ? "failed" : "completed";

      await supabase
        .from("generation_jobs")
        .update({ status: finalStatus, completed_images: completed, failed_images: failed, updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .in("status", ["processing", "queued"]);
    }

    return new Response(JSON.stringify({ status: "done" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("batch-generate error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
