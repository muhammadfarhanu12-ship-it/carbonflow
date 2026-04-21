import { motion } from "motion/react";
import { TrendingDown, ShieldCheck, Zap, Globe } from "lucide-react";

export function BenefitsSection() {
  const benefits = [
    {
      title: "Reduce Carbon Costs",
      description: "Identify high-emission routes and carriers to cut down on carbon taxes and offset costs.",
      icon: TrendingDown,
    },
    {
      title: "Future-Proof Compliance",
      description: "Stay ahead of global regulations like CSRD and SEC climate disclosure rules with automated reporting.",
      icon: ShieldCheck,
    },
    {
      title: "Boost Operational Efficiency",
      description: "Our AI doesn't just cut carbon—it finds the most efficient, cost-effective logistics paths.",
      icon: Zap,
    },
    {
      title: "Enhance Brand Value",
      description: "Showcase your commitment to sustainability with verified, transparent supply chain data.",
      icon: Globe,
    },
  ];

  return (
    <section className="py-24 bg-muted/30 border-y">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Why leading supply chains choose CarbonFlow.
          </h2>
          <p className="text-lg text-muted-foreground">
            We turn sustainability from a compliance burden into a competitive advantage.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="flex gap-6 p-8 rounded-3xl bg-background border shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <benefit.icon className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-3">{benefit.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
