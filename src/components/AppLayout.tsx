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
  ClipboardCheck,
  Undo2,
  Menu,
  FileSpreadsheet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import sparelubeLogo from "@/assets/sparelube-logo.png";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/current-stock", label: "Current Stock", icon: BarChart3 },
  { to: "/stock-upload", label: "Stock Upload", icon: FileUp },
  { to: "/stock-recon", label: "Stock Reconciliation", icon: ClipboardCheck },
  { to: "/sales-clearance", label: "Sales Clearance", icon: ClipboardMinus },
];

const creditSubItems = [
  { to: "/credits", label: "Record Credit", icon: Undo2 },
  { to: "/credits/import", label: "Import Credit Notes", icon: FileSpreadsheet },
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

function NavItem({
  to,
  label,
  icon: Icon,
  isActive,
  indent,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: any;
  isActive: boolean;
  indent?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 ${indent ? "pl-6" : ""} px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        isActive
          ? "bg-sidebar-accent/40 text-sidebar-primary shadow-[0_0_0_1px_hsl(var(--sidebar-primary)/0.35)]"
          : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
      }`}
    >
      <span
        className={`absolute inset-y-1 left-1 w-[2px] rounded-full bg-sidebar-primary transition-opacity ${
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        }`}
      />
      <div
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border/70 bg-sidebar-accent/20 text-xs transition-colors ${
          isActive ? "bg-sidebar-primary text-sidebar-primary-foreground border-transparent" : ""
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
  onNavigate,
}: {
  label: string;
  icon: any;
  items: { to: string; label: string; icon: any }[];
  isGroupActive: boolean;
  defaultOpen: boolean;
  currentPath: string;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 w-full text-left ${
          isGroupActive
            ? "text-sidebar-primary"
            : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
        }`}
      >
        <div
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border/70 bg-sidebar-accent/20 text-xs transition-colors ${
            isGroupActive ? "bg-sidebar-primary text-sidebar-primary-foreground border-transparent" : ""
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
            <NavItem
              key={item.to}
              {...item}
              isActive={currentPath === item.to}
              indent
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </>
  );
}

function SidebarBody({
  currentPath,
  onLogout,
  onNavigate,
}: {
  currentPath: string;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const isMovementRoute = currentPath.startsWith("/movements");
  const isMasterDataRoute = currentPath.startsWith("/master-data");
  const isCreditRoute = currentPath.startsWith("/credits");

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      <div className="px-5 pt-5 pb-4 border-b border-sidebar-border/70">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-white/95 ring-1 ring-sidebar-border/60 flex items-center justify-center shrink-0 overflow-hidden">
              <img src={sparelubeLogo} alt="SpareLube" className="h-9 w-9 object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight text-sidebar-primary truncate">
                SpareLube
              </h1>
              <p className="text-[10px] text-sidebar-foreground/60 mt-0.5 font-mono uppercase tracking-[0.18em]">
                Stock Control
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-sidebar-border/60 bg-sidebar-accent/30 px-2 py-1 shrink-0">
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
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            isActive={currentPath === item.to}
            onNavigate={onNavigate}
          />
        ))}

        <CollapsibleGroup
          label="Stock Movements"
          icon={ArrowLeftRight}
          items={movementSubItems}
          isGroupActive={isMovementRoute}
          defaultOpen={isMovementRoute}
          currentPath={currentPath}
          onNavigate={onNavigate}
        />

        <CollapsibleGroup
          label="Credits"
          icon={Undo2}
          items={creditSubItems}
          isGroupActive={isCreditRoute}
          defaultOpen={isCreditRoute}
          currentPath={currentPath}
          onNavigate={onNavigate}
        />

        <CollapsibleGroup
          label="Master Data"
          icon={Package}
          items={masterDataSubItems}
          isGroupActive={isMasterDataRoute}
          defaultOpen={isMasterDataRoute}
          currentPath={currentPath}
          onNavigate={onNavigate}
        />

      </nav>
      <div className="border-t border-sidebar-border/60 px-4 py-3">
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground text-sm transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [currentPath]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen w-full">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-72 shrink-0 border-r border-sidebar-border/70 shadow-[0_0_40px_rgba(0,0,0,0.4)]">
          <SidebarBody currentPath={currentPath} onLogout={handleLogout} />
        </aside>

        {/* Mobile drawer */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="p-0 w-[85vw] max-w-[320px] bg-sidebar border-sidebar-border/70"
          >
            <SidebarBody
              currentPath={currentPath}
              onLogout={handleLogout}
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <main className="flex-1 min-w-0 flex flex-col">
          {/* Mobile top bar */}
          <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-3 h-14 bg-sidebar text-sidebar-foreground border-b border-sidebar-border/70 shadow-sm">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-sidebar-border/60 bg-sidebar-accent/30 text-sidebar-foreground active:scale-95 transition"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
            </Sheet>
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-md bg-white/95 flex items-center justify-center overflow-hidden">
                <img src={sparelubeLogo} alt="SpareLube" className="h-7 w-7 object-contain" />
              </div>
              <span className="text-sm font-semibold text-sidebar-primary truncate">SpareLube</span>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-sidebar-border/60 bg-sidebar-accent/30 text-sidebar-foreground/80 active:scale-95 transition"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 p-3 sm:p-6 md:p-8 lg:p-10 max-w-7xl w-full mx-auto">
            <div className="rounded-xl md:rounded-3xl border border-border/60 bg-card md:shadow-[0_18px_60px_rgba(0,0,0,0.12)] ring-1 ring-black/5">
              <div className="hidden md:flex border-b border-border/60 px-6 py-3.5 items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.2)]" />
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80 font-mono">
                  SpareLube Inventory Control
                </p>
              </div>
              <div className="px-3 py-4 sm:px-5 sm:py-5 md:px-8 md:py-6">{children}</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
