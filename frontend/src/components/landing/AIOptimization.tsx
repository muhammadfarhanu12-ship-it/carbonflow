import { motion } from "motion/react";
import { Sparkles, ArrowRight } from "lucide-react";

export function AIOptimization() {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto rounded-3xl bg-gradient-to-br from-primary/5 via-background to-blue-500/5 border p-8 md:p-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center rounded-full border bg-background px-3 py-1 text-sm font-medium mb-6">
                <Sparkles className="mr-2 h-4 w-4 text-primary" />
                Powered by Advanced AI
              </div>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
                Ask your data. Get actionable insights.
              </h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Our AI analyzes thousands of shipments, routes, and carriers to suggest improvements that reduce both emissions and costs.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-background border shadow-sm">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <span className="font-bold text-primary text-sm">Q</span>
                  </div>
                  <p className="font-medium text-foreground">"How can we reduce emissions by 20% on the West Coast route?"</p>
                </div>
                
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/20 shadow-sm ml-8">
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-2">Based on your recent data, here are 3 recommendations:</p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2"><ArrowRight className="h-3 w-3 text-primary" /> Switch 15% of road freight to rail for LA to Seattle.</li>
                      <li className="flex items-center gap-2"><ArrowRight className="h-3 w-3 text-primary" /> Consolidate shipments from Supplier A to reduce LTL trips.</li>
                      <li className="flex items-center gap-2"><ArrowRight className="h-3 w-3 text-primary" /> Optimize carrier selection based on our new green-fleet index.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative h-full min-h-[400px] rounded-2xl border bg-card shadow-xl overflow-hidden"
            >
              <img 
                src="https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=2070&auto=format&fit=crop" 
                alt="AI Optimization Interface" 
                className="absolute inset-0 w-full h-full object-cover opacity-80"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent"></div>
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h3 className="text-xl font-bold mb-2">Optimization Engine</h3>
                <p className="text-sm text-muted-foreground">Real-time route and carrier analysis running continuously in the background.</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
