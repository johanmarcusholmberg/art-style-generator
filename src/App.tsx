import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import BatchNotifications from "@/components/BatchNotifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import RequireAuth from "@/components/auth/RequireAuth";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Account from "./pages/Account";
import AdminUsers from "./pages/AdminUsers";
import AdminAssets from "./pages/AdminAssets";
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
import ScandinavianPoster from "./pages/ScandinavianPoster";
import Vintage from "./pages/Vintage";
import Blend from "./pages/Blend";
import StyleCompare from "./pages/StyleCompare";
import BatchStudio from "./pages/BatchStudio";
import NotFound from "./pages/NotFound";
import ProviderDebug from "./pages/ProviderDebug";
import StyleControlPanel from "./pages/StyleControlPanel";

const queryClient = new QueryClient();


const protect = (node: React.ReactNode, adminOnly = false) => (
  <RequireAuth adminOnly={adminOnly}>{node}</RequireAuth>
);

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <BatchNotifications />
            
            <Routes>
              {/* Public auth routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Account */}
              <Route path="/account" element={protect(<Account />)} />

              {/* Admin */}
              <Route path="/admin" element={protect(<AdminUsers />, true)} />
              <Route path="/admin/users" element={protect(<AdminUsers />, true)} />
              <Route path="/admin/assets" element={protect(<AdminAssets />, true)} />

              {/* Generators (protected) */}
              <Route path="/" element={protect(<Index />)} />
              <Route path="/popart" element={protect(<PopArt />)} />
              <Route path="/lineart" element={protect(<LineArt />)} />
              <Route path="/minimalism" element={protect(<Minimalism />)} />
              <Route path="/graffiti" element={protect(<Graffiti />)} />
              <Route path="/botanical" element={protect(<Botanical />)} />
              <Route path="/urbannoir" element={protect(<UrbanNoir />)} />
              <Route path="/screenprint" element={protect(<ScreenPrint />)} />
              <Route path="/risograph" element={protect(<Risograph />)} />
              <Route path="/retrocomic" element={protect(<RetroComic />)} />
              <Route path="/pulpmagazine" element={protect(<PulpMagazine />)} />
              <Route path="/tattooflash" element={protect(<TattooFlash />)} />
              <Route path="/brutalistposter" element={protect(<BrutalistPoster />)} />
              <Route path="/xeroxzine" element={protect(<XeroxZine />)} />
              <Route path="/scandinavian-poster" element={protect(<ScandinavianPoster />)} />
              <Route path="/vintage" element={protect(<Vintage />)} />
              <Route path="/blend" element={protect(<Blend />)} />
              <Route path="/compare" element={protect(<StyleCompare />)} />
              <Route path="/batch" element={protect(<BatchStudio />)} />
              <Route path="/debug/providers" element={protect(<ProviderDebug />, true)} />
              <Route path="/style-control-panel" element={protect(<StyleControlPanel />, true)} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
