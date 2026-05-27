import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createStyleHandler } from "../_shared/prompt-compiler.ts";

serve(createStyleHandler("whimsical_japanese"));
