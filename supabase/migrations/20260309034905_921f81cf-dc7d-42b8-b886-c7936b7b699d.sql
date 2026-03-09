
-- Collections table
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Junction table for collection <-> image
CREATE TABLE public.collection_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid REFERENCES public.collections(id) ON DELETE CASCADE NOT NULL,
  image_id uuid REFERENCES public.generated_images(id) ON DELETE CASCADE NOT NULL,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (collection_id, image_id)
);

-- RLS
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view collections" ON public.collections FOR SELECT USING (true);
CREATE POLICY "Anyone can insert collections" ON public.collections FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update collections" ON public.collections FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete collections" ON public.collections FOR DELETE USING (true);

CREATE POLICY "Anyone can view collection_images" ON public.collection_images FOR SELECT USING (true);
CREATE POLICY "Anyone can insert collection_images" ON public.collection_images FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete collection_images" ON public.collection_images FOR DELETE USING (true);
