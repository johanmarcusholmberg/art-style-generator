import { useState, useEffect, useCallback } from "react";
import { cacheImageFromUrl, getCachedImage } from "@/lib/image-cache";

interface GenerationState {
  prompt: string;
  savedToGallery: boolean;
}

const STORAGE_KEY_PREFIX = "gen-state-";

export function usePersistedGeneration(mode: "japanese" | "freestyle", initialPrompt?: string) {
  const key = STORAGE_KEY_PREFIX + mode;
  const imgKey = `img-${mode}`;
  const baseImgKey = `img-base-${mode}`;

  const loadState = (): GenerationState | null => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const cached = loadState();

  const [imageUrl, setImageUrlState] = useState<string | null>(null);
  const [baseImageUrl, setBaseImageUrlState] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt || cached?.prompt || "");
  const [savedToGallery, setSavedToGallery] = useState(cached?.savedToGallery ?? false);

  // Restore images from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [img, baseImg] = await Promise.all([
        getCachedImage(imgKey),
        getCachedImage(baseImgKey),
      ]);
      if (!cancelled) {
        if (img) setImageUrlState(img);
        if (baseImg) setBaseImageUrlState(baseImg);
      }
    })();
    return () => { cancelled = true; };
  }, [imgKey, baseImgKey]);

  const persistMeta = useCallback((state: Partial<GenerationState>) => {
    try {
      const current = loadState() || { prompt: "", savedToGallery: false };
      sessionStorage.setItem(key, JSON.stringify({ ...current, ...state }));
    } catch { /* quota exceeded, ignore */ }
  }, [key]);

  // Wrap setters to also persist
  const setImageUrl = useCallback(async (url: string | null) => {
    if (url) {
      // Cache to IndexedDB as base64, then set state with the data-URL
      const dataUrl = await cacheImageFromUrl(imgKey, url);
      setImageUrlState(dataUrl);
    } else {
      setImageUrlState(null);
    }
  }, [imgKey]);

  const setBaseImageUrl = useCallback(async (url: string | null) => {
    if (url) {
      const dataUrl = await cacheImageFromUrl(baseImgKey, url);
      setBaseImageUrlState(dataUrl);
    } else {
      setBaseImageUrlState(null);
    }
  }, [baseImgKey]);

  const setPromptPersisted = useCallback((p: string) => {
    setPrompt(p);
    persistMeta({ prompt: p });
  }, [persistMeta]);

  const setSavedToGalleryPersisted = useCallback((v: boolean) => {
    setSavedToGallery(v);
    persistMeta({ savedToGallery: v });
  }, [persistMeta]);

  return {
    imageUrl, setImageUrl,
    baseImageUrl, setBaseImageUrl,
    prompt, setPrompt: setPromptPersisted,
    savedToGallery, setSavedToGallery: setSavedToGalleryPersisted,
  };
}
