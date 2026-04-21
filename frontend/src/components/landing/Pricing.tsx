import { motion } from "motion/react";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Starter",
    price: "$99",
    description: "For small logistics teams starting their carbon journey.",
    features: [
      "Up to 5,000 shipments/mo",
      "Basic emissions tracking",
      "Standard reporting",
      "Email support",
    ],
  },
  {
    name: "Growth",
    price: "$299",
    description: "For growing supply chains needing advanced insights.",
    features: [
      "Up to 50,000 shipments/mo",
      "Scope 1, 2, 3 accounting",
      "Supplier sustainability scores",
      "API access & Integrations",
      "Priority support",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "For global enterprises with complex logistics networks.",
    features: [
      "Unlimited shipments",
      "AI Logistics Optimization",
      "Custom integrations",
      "Dedicated success manager",
      "SLA & Custom reporting",
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Simple, transparent pricing.
          </h2>
          <p className="text-lg text-muted-foreground">
            Choose the plan that fits your supply chain volume and complexity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative flex flex-col p-8 rounded-3xl border ${
                plan.popular ? "bg-background shadow-xl border-primary/50" : "bg-card shadow-sm"
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  Most Popular
                </div>
              )}
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <p className="text-muted-foreground text-sm h-10">{plan.description}</p>
              </div>
              <div className="mb-8 flex items-baseline text-5xl font-extrabold tracking-tight">
                {plan.price}
                {plan.price !== "Custom" && <span className="text-xl font-medium text-muted-foreground ml-1">/mo</span>}
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <Check className="h-5 w-5 text-primary shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button 
                variant={plan.popular ? "default" : "outline"} 
                className="w-full h-12 text-base"
                asChild
              >
                <Link to="/auth/signup">
                  {plan.price === "Custom" ? "Contact Sales" : "Start Free Trial"}
                  {plan.price !== "Custom" && <ArrowRight className="ml-2 h-4 w-4" />}
                </Link>
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
