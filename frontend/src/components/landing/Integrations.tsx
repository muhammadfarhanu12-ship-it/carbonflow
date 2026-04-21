import { motion } from "motion/react";
import { Link2, Database, Code, ShieldCheck } from "lucide-react";

export function Integrations() {
  const integrationTypes = [
    { name: "ERP Systems", icon: Database },
    { name: "Transport Management", icon: Link2 },
    { name: "Supply Chain Software", icon: ShieldCheck },
    { name: "Logistics APIs", icon: Code },
  ];

  return (
    <section id="integrations" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
              Connects easily with your existing logistics platforms.
            </h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              CarbonFlow is designed to fit seamlessly into your current tech stack. Our robust APIs and pre-built connectors mean you don't have to rip and replace your existing systems to get world-class carbon intelligence.
            </p>
            <div className="grid grid-cols-2 gap-6">
              {integrationTypes.map((type) => (
                <div key={type.name} className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <type.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="font-medium">{type.name}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-blue-500/20 rounded-3xl blur-3xl -z-10"></div>
            <div className="bg-card border rounded-3xl p-8 shadow-xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Code className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Developer-First API</h3>
                  <p className="text-sm text-muted-foreground">RESTful endpoints for easy integration</p>
                </div>
              </div>
              <div className="bg-muted rounded-xl p-4 font-mono text-sm text-muted-foreground overflow-x-auto">
                <pre>
                  <code>
                    <span className="text-blue-500">POST</span> /api/v1/shipments/emissions
                    <br />
                    <span className="text-green-500">{"{"}</span>
                    <br />
                    {"  "}origin: <span className="text-yellow-500">"New York, NY"</span>,
                    <br />
                    {"  "}destination: <span className="text-yellow-500">"Los Angeles, CA"</span>,
                    <br />
                    {"  "}weight: <span className="text-orange-500">5000</span>,
                    <br />
                    {"  "}mode: <span className="text-yellow-500">"ROAD"</span>
                    <br />
                    <span className="text-green-500">{"}"}</span>
                  </code>
                </pre>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
