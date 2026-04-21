import { motion } from "motion/react";
import { Database, Calculator, LineChart } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Connect Data",
      description: "Connect your logistics data sources, TMS, or ERP systems seamlessly.",
      icon: Database,
    },
    {
      number: "02",
      title: "Calculate Automatically",
      description: "CarbonFlow calculates emissions automatically using verified methodologies.",
      icon: Calculator,
    },
    {
      number: "03",
      title: "Optimize & Reduce",
      description: "Use AI-driven insights to reduce emissions and optimize your logistics network.",
      icon: LineChart,
    },
  ];

  return (
    <section id="how-it-works" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-20">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            How it works
          </h2>
          <p className="text-lg text-muted-foreground">
            Get started in minutes, not months. Our streamlined workflow makes carbon accounting effortless.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto relative">
          {/* Connecting line for desktop */}
          <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 bg-border -z-10"></div>

          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.2 }}
              className="flex flex-col items-center text-center relative"
            >
              <div className="h-24 w-24 rounded-full bg-background border-4 border-muted flex items-center justify-center mb-6 shadow-sm relative z-10">
                <step.icon className="h-10 w-10 text-primary" />
              </div>
              <div className="text-sm font-bold text-primary/60 tracking-widest mb-2">STEP {step.number}</div>
              <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
