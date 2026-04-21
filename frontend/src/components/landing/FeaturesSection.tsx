import { motion } from "motion/react";
import { Truck, Globe, FileSpreadsheet, ShieldCheck, Cpu, ShoppingCart } from "lucide-react";

export function FeaturesSection() {
  const features = [
    {
      title: "Shipment Emissions Tracking",
      description: "Track emissions for every shipment across carriers and transport modes in real-time.",
      icon: Truck,
    },
    {
      title: "Scope 1, 2, and 3 Accounting",
      description: "Automatically calculate emissions across operations and supply chains with precision.",
      icon: Globe,
    },
    {
      title: "Carbon Ledger",
      description: "Link carbon data with financial cost to understand sustainability impact on your bottom line.",
      icon: FileSpreadsheet,
    },
    {
      title: "Supplier Sustainability Scores",
      description: "Evaluate suppliers based on emissions and sustainability metrics to build a greener network.",
      icon: ShieldCheck,
    },
    {
      title: "AI Logistics Optimization",
      description: "Get AI-powered recommendations to reduce emissions and costs simultaneously.",
      icon: Cpu,
    },
    {
      title: "Carbon Offset Marketplace",
      description: "Offset unavoidable emissions with verified, high-quality carbon projects directly in-app.",
      icon: ShoppingCart,
    },
  ];

  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Everything you need to manage logistics carbon.
          </h2>
          <p className="text-lg text-muted-foreground">
            A complete suite of tools designed specifically for supply chain and logistics professionals.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="p-8 rounded-3xl bg-muted/30 border hover:bg-muted/50 transition-colors"
            >
              <feature.icon className="h-10 w-10 text-primary mb-6" />
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
