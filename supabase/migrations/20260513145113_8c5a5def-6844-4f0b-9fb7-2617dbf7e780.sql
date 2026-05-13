alter table public.generated_images add column if not exists source_image_url text;
alter table public.generated_images add column if not exists source_storage_path text;
alter table public.generated_images add column if not exists source_file_name text;