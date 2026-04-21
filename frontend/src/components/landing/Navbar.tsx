import { Link } from "react-router-dom";
import { Leaf } from "lucide-react";
import { Button } from "@/src/components/ui/button";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold tracking-tight">CarbonFlow</span>
        </div>
        
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
          <a href="#integrations" className="hover:text-foreground transition-colors">Integrations</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          <a href="#resources" className="hover:text-foreground transition-colors">Resources</a>
          <a href="#contact" className="hover:text-foreground transition-colors">Contact</a>
        </div>

        <div className="flex items-center gap-4">
          <Link to="/auth/signin" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Login
          </Link>
          <Button asChild>
            <Link to="/auth/signup">Start Free Trial</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
