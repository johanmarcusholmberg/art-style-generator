/**
 * Style Lab — canonical style metadata (thin re-export).
 *
 * This module used to keep its own route → styleKey table. That table
 * has moved to `src/lib/style-registry.ts` so Style Lab, Batch Studio,
 * Style Compare and the Control Panel all derive from a single source.
 * The `StyleLabStyle` type and the `STYLE_LAB_STYLES`, `styleKeyForRoute`,
 * `styleByKey` exports keep their shape for backward compatibility.
 */

import {
  getStyleLabStyles,
  styleKeyForRoute as registryStyleKeyForRoute,
  type StyleLabRegistryEntry,
} from "@/lib/style-registry";

export type StyleLabStyle = StyleLabRegistryEntry;

export const STYLE_LAB_STYLES: StyleLabStyle[] = getStyleLabStyles();

export function styleKeyForRoute(route: string): string | undefined {
  return registryStyleKeyForRoute(route);
}

export function styleByKey(key: string): StyleLabStyle | undefined {
  return STYLE_LAB_STYLES.find((s) => s.styleKey === key);
}
