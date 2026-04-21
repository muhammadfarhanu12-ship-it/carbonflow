import { Navbar } from "../components/landing/Navbar";
import { HeroSection } from "../components/landing/HeroSection";
import { ProductOverview } from "../components/landing/ProductOverview";
import { FeaturesSection } from "../components/landing/FeaturesSection";
import { ProductScreenshots } from "../components/landing/ProductScreenshots";
import { HowItWorks } from "../components/landing/HowItWorks";
import { Integrations } from "../components/landing/Integrations";
import { AIOptimization } from "../components/landing/AIOptimization";
import { Pricing } from "../components/landing/Pricing";
import { CTASection } from "../components/landing/CTASection";
import { Footer } from "../components/landing/Footer";
import { BenefitsSection } from "../components/landing/BenefitsSection";
import { TestimonialsSection } from "../components/landing/TestimonialsSection";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <Navbar />
      <main>
        <HeroSection />
        <ProductOverview />
        <FeaturesSection />
        <ProductScreenshots />
        <HowItWorks />
        <BenefitsSection />
        <Integrations />
        <AIOptimization />
        <TestimonialsSection />
        <Pricing />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
