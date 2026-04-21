import { motion } from "motion/react";
import { useState } from "react";

const tabs = [
  { id: "dashboard", label: "Dashboard", img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop" },
  { id: "analytics", label: "Shipment Analytics", img: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop" },
  { id: "ledger", label: "Carbon Ledger", img: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=2036&auto=format&fit=crop" },
  { id: "suppliers", label: "Supplier Rankings", img: "https://images.unsplash.com/photo-1664575602276-acd073f104c1?q=80&w=2070&auto=format&fit=crop" },
  { id: "ai", label: "AI Optimization", img: "https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=2070&auto=format&fit=crop" },
];

export function ProductScreenshots() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  return (
    <section className="py-24 bg-muted/20 border-y">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            See CarbonFlow in action.
          </h2>
          <p className="text-lg text-muted-foreground">
            A beautiful, intuitive interface designed for complex logistics data.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="max-w-5xl mx-auto relative rounded-xl border bg-card shadow-2xl overflow-hidden aspect-[16/9]">
          <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500/80"></div>
              <div className="h-3 w-3 rounded-full bg-yellow-500/80"></div>
              <div className="h-3 w-3 rounded-full bg-green-500/80"></div>
            </div>
          </div>
          <div className="p-2 bg-muted/20 h-full">
            {tabs.map((tab) => (
              <motion.img
                key={tab.id}
                src={tab.img}
                alt={tab.label}
                className="w-full h-full object-cover rounded-lg border shadow-sm absolute top-12 left-0 right-0 bottom-0 px-2 pb-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: activeTab === tab.id ? 1 : 0 }}
                transition={{ duration: 0.4 }}
                style={{ pointerEvents: activeTab === tab.id ? "auto" : "none" }}
                referrerPolicy="no-referrer"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
