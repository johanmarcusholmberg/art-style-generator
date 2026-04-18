import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import BatchNotifications from "@/components/BatchNotifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import PopArt from "./pages/PopArt";
import LineArt from "./pages/LineArt";
import Minimalism from "./pages/Minimalism";
import Graffiti from "./pages/Graffiti";
import Botanical from "./pages/Botanical";
import UrbanNoir from "./pages/UrbanNoir";
import ScreenPrint from "./pages/ScreenPrint";
import Risograph from "./pages/Risograph";
import RetroComic from "./pages/RetroComic";
import PulpMagazine from "./pages/PulpMagazine";
import TattooFlash from "./pages/TattooFlash";
import BrutalistPoster from "./pages/BrutalistPoster";
import XeroxZine from "./pages/XeroxZine";
import Blend from "./pages/Blend";
import StyleCompare from "./pages/StyleCompare";
import BatchStudio from "./pages/BatchStudio";
import NotFound from "./pages/NotFound";
import ProviderDebug from "./pages/ProviderDebug";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BatchNotifications />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/popart" element={<PopArt />} />
            <Route path="/lineart" element={<LineArt />} />
            <Route path="/minimalism" element={<Minimalism />} />
            <Route path="/graffiti" element={<Graffiti />} />
            <Route path="/botanical" element={<Botanical />} />
            <Route path="/urbannoir" element={<UrbanNoir />} />
            <Route path="/screenprint" element={<ScreenPrint />} />
            <Route path="/risograph" element={<Risograph />} />
            <Route path="/retrocomic" element={<RetroComic />} />
            <Route path="/pulpmagazine" element={<PulpMagazine />} />
            <Route path="/tattooflash" element={<TattooFlash />} />
            <Route path="/brutalistposter" element={<BrutalistPoster />} />
            <Route path="/xeroxzine" element={<XeroxZine />} />
            <Route path="/blend" element={<Blend />} />
            <Route path="/compare" element={<StyleCompare />} />
            <Route path="/batch" element={<BatchStudio />} />
            <Route path="/debug/providers" element={<ProviderDebug />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
