import { motion } from "motion/react";
import { Button } from "@/src/components/ui/button";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";

export function CTASection() {
  return (
    <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1586528116311-ad8ed7c50a63?q=80&w=2070&auto=format&fit=crop')] opacity-10 bg-cover bg-center mix-blend-overlay"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent"></div>
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h2 
            className="text-4xl md:text-6xl font-bold tracking-tight mb-8 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Start Managing Carbon in Your Supply Chain Today.
          </motion.h2>
          
          <motion.p 
            className="text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Join industry leaders who are reducing emissions, cutting costs, and building sustainable logistics networks with CarbonFlow.
          </motion.p>
          
          <motion.div 
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Button size="lg" variant="secondary" className="w-full sm:w-auto text-base h-14 px-8 text-primary font-semibold" asChild>
              <Link to="/auth/signup">
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-14 px-8 border-primary-foreground/20 hover:bg-primary-foreground/10 text-primary-foreground">
              <PlayCircle className="mr-2 h-5 w-5" />
              Schedule Demo
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
