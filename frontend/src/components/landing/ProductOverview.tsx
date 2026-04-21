import { motion } from "motion/react";
import { Activity, Leaf, TrendingDown, BrainCircuit } from "lucide-react";

export function ProductOverview() {
  const highlights = [
    {
      title: "Real-time Shipment Emissions",
      description: "Track carbon output per shipment instantly.",
      icon: Activity,
    },
    {
      title: "Supplier Sustainability Insights",
      description: "Evaluate your supply chain partners.",
      icon: Leaf,
    },
    {
      title: "Carbon Cost Analytics",
      description: "Understand the financial impact of your footprint.",
      icon: TrendingDown,
    },
    {
      title: "AI Logistics Optimization",
      description: "Get smart recommendations to reduce emissions.",
      icon: BrainCircuit,
    },
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
            What is CarbonFlow?
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            CarbonFlow integrates directly with supply chain systems and automatically calculates carbon emissions for logistics operations. We provide the intelligence you need to make sustainable decisions without compromising efficiency.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {highlights.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="flex flex-col items-center text-center p-6 rounded-2xl bg-background border shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <item.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
