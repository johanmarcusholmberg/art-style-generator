## Cost Dashboard — `/admin/costs`

Admin-only read-only view over `asset_cost_events`. Surfaces what we already record so we can see spend before scaling generation volume. No new tracking, no edits.

### Scope
- New page `src/pages/AdminCosts.tsx`, route `/admin/costs`, gated by `is_current_user_admin()` like AdminAssets.
- New lib `src/lib/cost-analytics.ts` — fetch + aggregate (pure, testable).
- Link from AdminAssets header ("Costs") — single small nav addition.
- No DB migration. Existing admin SELECT policy already permits this.

### Data
Fetch up to 5000 most-recent rows from `asset_cost_events`. Client-side aggregate (matches Style Lab Insights pattern). Existing columns only: `event_type, provider, model, mode, estimated_cost, currency, status, created_at`.

### Filters
- Date range (from/to, defaults: last 30 days)
- Event type (all / generation / upscale / print_export)
- Provider (all / dynamic from data)
- Status (default: succeeded only)

### Sections
1. **Summary cards** — total spend, event count, % with known cost, distinct images touched.
2. **Spend by provider** — table: provider · events · total cost · avg cost/event.
3. **Spend by style (mode)** — table: mode · events · total cost.
4. **Spend by event type** — table: event_type · events · total cost.
5. **Daily spend** — simple bar list (date · count · cost) for the selected range. No chart lib dependency; use existing styled rows like InsightsPanel.
6. **Recent events** — last 50 rows with link-out to the image (uses `generated_image_id` → AdminAssets row).

### Cost-unknown handling
Mirror `summarizeImageCost`: sum known `estimated_cost`, show "+ N unknown" badge where rows have null cost. Never invent prices.

### Tests
`src/lib/cost-analytics.test.ts` — aggregation helpers (by provider, by mode, by day, summary with unknowns, status filter). No UI tests.

### Out of scope
- Editing/deleting cost events
- Forecasting or budgets
- Per-user breakdowns (single-creator app)
- Charts library
- Backfilling missing prices

### Files
- add: `src/pages/AdminCosts.tsx`
- add: `src/lib/cost-analytics.ts`
- add: `src/lib/cost-analytics.test.ts`
- edit: `src/App.tsx` (route)
- edit: `src/pages/AdminAssets.tsx` (header link)
