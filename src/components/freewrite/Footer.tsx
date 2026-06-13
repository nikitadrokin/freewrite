import { Clock, History, Plus } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { formatTime } from "./format";

type FooterProps = {
  activeView: "write" | "history";
  elapsedSeconds: number;
  onNewEntry: () => void;
  onToggleHistory: () => void;
  storageError: string | null;
  wordCount: number;
};

export function Footer({
  activeView,
  elapsedSeconds,
  onNewEntry,
  onToggleHistory,
  storageError,
  wordCount,
}: FooterProps) {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 select-none border-t bg-background/90 px-4 py-3 text-muted-foreground backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-3 text-sm sm:text-base">
        <span>{wordCount} words</span>

        <ToolbarButton>
          <Clock className="size-4" />
          {formatTime(elapsedSeconds)}
        </ToolbarButton>

        <div className="flex items-center gap-2">
          <ToolbarButton onClick={onNewEntry}>
            <Plus className="size-4" />
            New Entry
          </ToolbarButton>
          <ToolbarButton
            active={activeView === "history"}
            onClick={onToggleHistory}
          >
            <History className="size-4" />
            History
          </ToolbarButton>
        </div>
      </div>
      {storageError ? (
        <p className="mx-auto mt-2 max-w-7xl text-xs text-destructive">
          Storage unavailable: {storageError}
        </p>
      ) : null}
    </footer>
  );
}

function ToolbarButton({
  active = false,
  className,
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground",
        className,
      )}
      type="button"
      {...props}
    />
  );
}

