import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import CurrentStock from "@/pages/CurrentStock";
import StockUpload from "@/pages/StockUpload";
import StockRecon from "@/pages/StockRecon";
import SalesClearance from "@/pages/SalesClearance";
import Receiving from "@/pages/Receiving";
import Issuing from "@/pages/Issuing";
import Transfer from "@/pages/Transfer";
import Credits from "@/pages/Credits";
import CreditNotesImport from "@/pages/CreditNotesImport";
import Products from "@/pages/Products";
import Warehouses from "@/pages/Warehouses";
import Login from "@/pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm font-mono">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm font-mono">Loading...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/current-stock" element={<CurrentStock />} />
                      <Route path="/stock-upload" element={<StockUpload />} />
                      <Route path="/stock-recon" element={<StockRecon />} />
                      <Route path="/sales-clearance" element={<SalesClearance />} />
                      <Route path="/movements" element={<Navigate to="/movements/receiving" replace />} />
                      <Route path="/movements/receiving" element={<Receiving />} />
                      <Route path="/movements/issuing" element={<Issuing />} />
                      <Route path="/movements/transfer" element={<Transfer />} />
                      <Route path="/credits" element={<Credits />} />
                      <Route path="/credits/import" element={<CreditNotesImport />} />
                      <Route path="/master-data" element={<Navigate to="/master-data/products" replace />} />
                      <Route path="/master-data/products" element={<Products />} />
                      <Route path="/master-data/warehouses" element={<Warehouses />} />
                      <Route path="/products" element={<Navigate to="/master-data/products" replace />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
