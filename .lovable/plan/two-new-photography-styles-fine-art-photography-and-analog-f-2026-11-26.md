# Two new photography styles: Fine Art Photography and Analog Film

Two general-purpose photography styles for realistic photos of any subject (landscapes, nature, still life, city, interiors, people without text), printed at 50x70 cm like your other styles.

## What you get
- **Fine Art Photography** page: clean, sharp, natural light, real textures, neutral true-to-life colors.
- **Analog Film** page: 35mm/medium-format film feel, soft natural grain, gentle warm tones, slight film color shifts, softer contrast.
- Both listed with your other styles (Batch Studio, Style Lab, Gallery filters, Compare).
- Both avoid illustration, painting, 3D and cartoon looks. No place restriction (unlike Mediterranean Heritage).
- Tips box, color override, per-style default generator, print quality card and upscaling work as on other pages.
- Example subjects in the tips: misty forest at dawn, still life with ceramics, quiet city street at night, coastal cliffs.

## Technical details
- Register both in `style-registry.ts`, `style-config.ts`, `prompt-rules.ts`, `style-prompt-metadata.ts` (client + `_shared` Deno copy), `style-routing.ts`, `prompt-profiles.ts`, `style-meta.ts`.
- Pages `src/pages/FineArtPhotography.tsx` and `src/pages/AnalogFilm.tsx` modeled on `MediterraneanHeritage.tsx`, routes in `App.tsx`.
- Edge functions `generate-image-fineartphotography`, `generate-image-analogfilm` (+ `-freestyle` each) cloned from the Mediterranean pair. Shared guardrails: avoid illustration, painting, CGI, text/watermarks. Fine art also avoids grain and oversaturation; Analog avoids digital sharpness and HDR look.
- Upscale recipes: Real-ESRGAN Large for Fine Art; Analog keeps grain (no heavy denoise).
- Update registry/catalog/metadata tests for both styles; run them and deploy the functions.
