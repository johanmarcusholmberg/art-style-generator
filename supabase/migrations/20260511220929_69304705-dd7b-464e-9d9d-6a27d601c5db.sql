-- Asset metadata foundation (Part C of architecture upgrade).
-- All additions are backward-compatible (IF NOT EXISTS, with defaults).

alter table public.generated_images add column if not exists asset_role text default 'enhanced_master';
alter table public.generated_images add column if not exists provider text;
alter table public.generated_images add column if not exists model text;
alter table public.generated_images add column if not exists route text;
alter table public.generated_images add column if not exists estimated_cost numeric;
alter table public.generated_images add column if not exists currency text default 'USD';
alter table public.generated_images add column if not exists prompt_version text;
alter table public.generated_images add column if not exists base_image_url text;
alter table public.generated_images add column if not exists master_image_url text;
alter table public.generated_images add column if not exists master_width integer;
alter table public.generated_images add column if not exists master_height integer;
alter table public.generated_images add column if not exists print_readiness text default 'unknown';

-- Note: source_width/source_height already exist on the table.
