import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import CurrentStock from "@/pages/CurrentStock";
import Receiving from "@/pages/Receiving";
import Issuing from "@/pages/Issuing";
import Transfer from "@/pages/Transfer";
import MasterData from "@/pages/MasterData";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/current-stock" element={<CurrentStock />} />
              <Route path="/movements" element={<Navigate to="/movements/receiving" replace />} />
              <Route path="/movements/receiving" element={<Receiving />} />
              <Route path="/movements/issuing" element={<Issuing />} />
              <Route path="/movements/transfer" element={<Transfer />} />
              <Route path="/master-data" element={<MasterData />} />
              <Route path="/products" element={<Navigate to="/master-data" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
