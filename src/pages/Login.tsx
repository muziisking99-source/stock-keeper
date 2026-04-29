import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import sparelubeLogo from "@/assets/sparelube-logo.png";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back!");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.18),_transparent_55%),radial-gradient(circle_at_bottom,_hsl(0_0%_0%/0.4),_transparent_55%)] bg-background">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex flex-col items-center mb-6">
          <img
            src={sparelubeLogo}
            alt="SpareLube — Auto Lubricant Distributors"
            className="w-44 sm:w-52 h-auto drop-shadow-[0_8px_24px_rgba(227,6,19,0.25)]"
          />
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/95 shadow-[0_18px_60px_rgba(0,0,0,0.25)] ring-1 ring-black/5 p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Stock Control</h1>
            <p className="text-xs text-muted-foreground mt-1 font-mono uppercase tracking-[0.18em]">
              Sign In
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="h-11"
                autoComplete="email"
                inputMode="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="h-11"
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? "Please wait..." : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
