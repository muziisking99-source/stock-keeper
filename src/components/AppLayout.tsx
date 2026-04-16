import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  BarChart3,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  Warehouse,
  ShoppingCart,
  LogOut,
  FileUp,
  ClipboardMinus,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/current-stock", label: "Current Stock", icon: BarChart3 },
  { to: "/stock-upload", label: "Stock Upload", icon: FileUp },
  { to: "/sales-clearance", label: "Sales Clearing", icon: ClipboardMinus },
];

const movementSubItems = [
  { to: "/movements/receiving", label: "Receiving", icon: ArrowDownToLine },
  { to: "/movements/issuing", label: "Issuing", icon: ArrowUpFromLine },
  { to: "/movements/transfer", label: "Transfer", icon: ArrowLeftRight },
];

const masterDataSubItems = [
  { to: "/master-data/products", label: "Products", icon: ShoppingCart },
  { to: "/master-data/warehouses", label: "Warehouses", icon: Warehouse },
];

function NavItem({ to, label, icon: Icon, isActive, indent }: { to: string; label: string; icon: any; isActive: boolean; indent?: boolean }) {
  return (
    <Link
      to={to}
      className={`group relative flex items-center gap-3 ${indent ? "pl-6" : ""} px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        isActive
          ? "bg-sidebar-accent/25 text-sidebar-primary shadow-[0_0_0_1px_rgba(148,163,184,0.3)]"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/10"
      }`}
    >
      <span
        className={`absolute inset-y-1 left-1 w-[2px] rounded-full bg-sidebar-primary/90 transition-opacity ${
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        }`}
      />
      <div
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sidebar-border/70 bg-sidebar-accent/10 text-xs transition-colors ${
          isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : ""
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span>{label}</span>
    </Link>
  );
}

function CollapsibleGroup({
  label,
  icon: Icon,
  items,
  isGroupActive,
  defaultOpen,
  currentPath,
}: {
  label: string;
  icon: any;
  items: { to: string; label: string; icon: any }[];
  isGroupActive: boolean;
  defaultOpen: boolean;
  currentPath: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 w-full text-left ${
          isGroupActive
            ? "text-sidebar-primary"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/10"
        }`}
      >
        <div
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sidebar-border/70 bg-sidebar-accent/10 text-xs transition-colors ${
            isGroupActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : ""
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <span className="flex-1">{label}</span>
        <ChevronDown
          className={`h-4 w-4 text-sidebar-foreground/50 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-0.5 ml-2">
          {items.map((item) => (
            <NavItem key={item.to} {...item} isActive={currentPath === item.to} indent />
          ))}
        </div>
      )}
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const isMovementRoute = currentPath.startsWith("/movements");
  const isMasterDataRoute = currentPath.startsWith("/master-data");

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(129,140,248,0.16),_transparent_55%)] bg-background/95 text-foreground">
      <div className="flex min-h-screen backdrop-blur-3xl">
        <aside className="w-72 bg-sidebar/90 text-sidebar-foreground flex flex-col shrink-0 border-r border-sidebar-border/70 shadow-[0_0_40px_rgba(15,23,42,0.7)]">
          <div className="p-6 border-b border-sidebar-border/60">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-sidebar-primary">
                  StockTracker
                </h1>
                <p className="text-[11px] text-sidebar-foreground/60 mt-1 font-mono uppercase tracking-[0.18em]">
                  Warehouse Control
                </p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-sidebar-border/60 bg-sidebar-accent/10 px-2 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/70">
                  Live
                </span>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => (
              <NavItem key={item.to} {...item} isActive={currentPath === item.to} />
            ))}

            <CollapsibleGroup
              label="Stock Movements"
              icon={ArrowLeftRight}
              items={movementSubItems}
              isGroupActive={isMovementRoute}
              defaultOpen={isMovementRoute}
              currentPath={currentPath}
            />

            <CollapsibleGroup
              label="Master Data"
              icon={Package}
              items={masterDataSubItems}
              isGroupActive={isMasterDataRoute}
              defaultOpen={isMasterDataRoute}
              currentPath={currentPath}
            />
          </nav>
          <div className="border-t border-sidebar-border/60 px-4 py-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground text-sm transition-colors w-full"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="p-8 md:p-10 lg:p-12 max-w-7xl mx-auto">
            <div className="rounded-3xl border border-border/60 bg-card/80 shadow-[0_18px_60px_rgba(15,23,42,0.35)] ring-1 ring-white/5">
              <div className="border-b border-border/60 px-6 py-3.5 flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400/80 shadow-[0_0_0_4px_rgba(16,185,129,0.35)]" />
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80 font-mono">
                  Inventory Control Surface
                </p>
              </div>
              <div className="px-6 pb-6 pt-5 md:px-8 md:pb-8 md:pt-6">{children}</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
