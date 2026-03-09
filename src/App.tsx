import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import PopArt from "./pages/PopArt";
import LineArt from "./pages/LineArt";
import Minimalism from "./pages/Minimalism";
import Graffiti from "./pages/Graffiti";
import Botanical from "./pages/Botanical";
import Blend from "./pages/Blend";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/popart" element={<PopArt />} />
          <Route path="/lineart" element={<LineArt />} />
          <Route path="/minimalism" element={<Minimalism />} />
          <Route path="/graffiti" element={<Graffiti />} />
          <Route path="/botanical" element={<Botanical />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
