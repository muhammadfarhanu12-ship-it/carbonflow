import { motion } from "motion/react";

export function TestimonialsSection() {
  const testimonials = [
    {
      quote: "CarbonFlow completely transformed how we view our supply chain. We identified a 15% reduction in emissions just by optimizing our LTL shipments, saving us thousands in offset costs.",
      author: "Sarah Jenkins",
      role: "VP of Supply Chain, GlobalTech",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop",
    },
    {
      quote: "The automated Scope 3 reporting is a lifesaver. What used to take our sustainability team three months now happens in real-time on the dashboard.",
      author: "Marcus Chen",
      role: "Sustainability Director, EcoLogistics",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=150&auto=format&fit=crop",
    },
    {
      quote: "Integrating CarbonFlow with our existing TMS was incredibly smooth. The AI recommendations are spot-on and have helped us negotiate better, greener contracts with carriers.",
      author: "Elena Rodriguez",
      role: "Head of Logistics, PrimeRetail",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=150&auto=format&fit=crop",
    },
  ];

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Trusted by industry leaders.
          </h2>
          <p className="text-lg text-muted-foreground">
            See how companies are using CarbonFlow to build sustainable, efficient supply chains.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.author}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="flex flex-col p-8 rounded-3xl bg-muted/30 border"
            >
              <div className="flex-1 mb-8">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-5 h-5 text-yellow-500 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-lg text-foreground leading-relaxed font-medium">
                  "{testimonial.quote}"
                </p>
              </div>
              <div className="flex items-center gap-4">
                <img 
                  src={testimonial.avatar} 
                  alt={testimonial.author} 
                  className="w-12 h-12 rounded-full object-cover border-2 border-background shadow-sm"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <h4 className="font-semibold text-foreground">{testimonial.author}</h4>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
