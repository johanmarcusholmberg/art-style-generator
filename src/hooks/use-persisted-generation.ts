import { useState, useEffect, useCallback } from "react";

interface GenerationState {
  imageUrl: string | null;
  baseImageUrl: string | null;
  prompt: string;
  savedToGallery: boolean;
}

const STORAGE_KEY_PREFIX = "gen-state-";

export function usePersistedGeneration(mode: "japanese" | "freestyle", initialPrompt?: string) {
  const key = STORAGE_KEY_PREFIX + mode;

  const loadState = (): GenerationState | null => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const cached = loadState();

  const [imageUrl, setImageUrl] = useState<string | null>(cached?.imageUrl ?? null);
  const [baseImageUrl, setBaseImageUrl] = useState<string | null>(cached?.baseImageUrl ?? null);
  const [prompt, setPrompt] = useState(initialPrompt || cached?.prompt || "");
  const [savedToGallery, setSavedToGallery] = useState(cached?.savedToGallery ?? false);

  const persist = useCallback((state: Partial<GenerationState>) => {
    try {
      const current = loadState() || { imageUrl: null, baseImageUrl: null, prompt: "", savedToGallery: false };
      sessionStorage.setItem(key, JSON.stringify({ ...current, ...state }));
    } catch { /* quota exceeded, ignore */ }
  }, [key]);

  // Wrap setters to also persist
  const setImageUrlPersisted = useCallback((url: string | null) => {
    setImageUrl(url);
    persist({ imageUrl: url });
  }, [persist]);

  const setBaseImageUrlPersisted = useCallback((url: string | null) => {
    setBaseImageUrl(url);
    persist({ baseImageUrl: url });
  }, [persist]);

  const setPromptPersisted = useCallback((p: string) => {
    setPrompt(p);
    persist({ prompt: p });
  }, [persist]);

  const setSavedToGalleryPersisted = useCallback((v: boolean) => {
    setSavedToGallery(v);
    persist({ savedToGallery: v });
  }, [persist]);

  return {
    imageUrl, setImageUrl: setImageUrlPersisted,
    baseImageUrl, setBaseImageUrl: setBaseImageUrlPersisted,
    prompt, setPrompt: setPromptPersisted,
    savedToGallery, setSavedToGallery: setSavedToGalleryPersisted,
  };
}
