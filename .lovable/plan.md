# New style: Fine Art Photography

A general-purpose photography style for realistic photos of any subject (landscapes, nature, still life, city, interiors, portraits without text), printed at 50x70 cm like your other styles.

## What you get
- A new "Fine Art Photography" page, listed with your other styles (Batch Studio, Style Lab, Gallery filters, Compare).
- Realistic photo look: natural light, real textures, proper depth of field, neutral true-to-life colors. No illustration, painting, 3D or cartoon look.
- No place restriction (unlike Mediterranean Heritage), so any subject works.
- Tips box, color override, per-style default generator, print quality card and upscaling all work as on other pages.
- Example subjects in the tips: misty forest at dawn, still life with ceramics, quiet city street at night, coastal cliffs.

## Assumption
Look is "clean fine-art" (sharp, natural light, neutral colors) unless you pick another in the question card.

## Technical details
- Register in `style-registry.ts`, `style-config.ts`, `prompt-rules.ts`, `style-prompt-metadata.ts` (client + `_shared` Deno copy), `style-routing.ts`, `prompt-profiles.ts`, `style-meta.ts`.
- New page `src/pages/FineArtPhotography.tsx` modeled on `MediterraneanHeritage.tsx`, route in `App.tsx`.
- Edge functions `generate-image-fineartphotography` (+ `-freestyle`) cloned from the Mediterranean pair, with photo guardrails (avoid: illustration, painting, CGI, oversaturation, text/watermarks); upscale recipe favoring Real-ESRGAN Large (photos suit it).
- Update registry/catalog/metadata tests for the new style; run them and deploy the functions.
