import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/src/components/ui/button";

export function Modal({
  open,
  title,
  description,
  onClose,
  panelClassName = "",
  contentClassName = "",
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  panelClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 px-4 py-6" onClick={onClose}>
      <div
        className={`w-full max-w-2xl rounded-2xl border border-white/10 bg-background shadow-2xl ${panelClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className={`px-6 py-5 ${contentClassName}`}>{children}</div>
      </div>
    </div>
  );
}
