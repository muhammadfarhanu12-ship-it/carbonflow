import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import type { MarketplaceListingStatus } from "@/src/types/platform";

interface MarketplaceActionsMenuProps {
  status: MarketplaceListingStatus;
  disableEdit?: boolean;
  disableRestore?: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onMoveToDraft: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onMarkSoldOut: () => void;
}

export function MarketplaceActionsMenu({
  status,
  disableEdit = false,
  disableRestore = false,
  onEdit,
  onPublish,
  onMoveToDraft,
  onArchive,
  onDelete,
  onRestore,
  onMarkSoldOut,
}: MarketplaceActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function runAction(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={containerRef} className="relative" onClick={(event) => event.stopPropagation()}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full"
        aria-label="Marketplace listing actions"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {open ? (
        <div className="absolute right-0 top-11 z-30 min-w-48 rounded-xl border bg-popover p-2 shadow-xl">
          {status !== "ARCHIVED" ? (
            <ActionButton disabled={disableEdit} onClick={() => runAction(onEdit)}>
              Edit Listing
            </ActionButton>
          ) : null}
          {status === "DRAFT" ? (
            <ActionButton onClick={() => runAction(onPublish)}>
              Publish Listing
            </ActionButton>
          ) : null}
          {status === "PUBLISHED" ? (
            <ActionButton onClick={() => runAction(onMoveToDraft)}>
              Move to Draft
            </ActionButton>
          ) : null}
          {status !== "ARCHIVED" && status !== "SOLD_OUT" ? (
            <ActionButton onClick={() => runAction(onMarkSoldOut)}>
              Mark Sold Out
            </ActionButton>
          ) : null}
          {status !== "ARCHIVED" ? (
            <ActionButton onClick={() => runAction(onArchive)}>
              Archive Listing
            </ActionButton>
          ) : null}
          {status === "ARCHIVED" ? (
            <ActionButton disabled={disableRestore} onClick={() => runAction(onRestore)}>
              Restore Listing
            </ActionButton>
          ) : null}
          <ActionButton destructive onClick={() => runAction(onDelete)}>
            Delete / Archive
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  children,
  destructive = false,
  disabled = false,
  onClick,
}: {
  children: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${destructive ? "text-destructive" : "text-popover-foreground"}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
