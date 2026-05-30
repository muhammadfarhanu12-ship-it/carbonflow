import { NO_PERMISSION_MESSAGE } from "@/src/utils/permissions";

export function PermissionDenied({ message = NO_PERMISSION_MESSAGE }: { message?: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}
