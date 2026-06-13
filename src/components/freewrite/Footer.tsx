import {
  Clock,
  Download,
  History,
  Pause,
  Play,
  Plus,
  RotateCcw,
} from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { formatTime } from "./format";

type FooterProps = {
  activeView: "write" | "history";
  elapsedSeconds: number;
  onNewEntry: () => void;
  onResetTimer: () => void;
  onStartTimer: () => void;
  onToggleTimer: () => void;
  onToggleHistory: () => void;
  onUpdate: () => void;
  storageError: string | null;
  timerDurationMinutes: number;
  timerStatus: "idle" | "running" | "paused";
  updateStatus: "idle" | "checking" | "current" | "installing" | "error";
  wordCount: number;
};

export function Footer({
  activeView,
  elapsedSeconds,
  onNewEntry,
  onResetTimer,
  onStartTimer,
  onToggleTimer,
  onToggleHistory,
  onUpdate,
  storageError,
  timerDurationMinutes,
  timerStatus,
  updateStatus,
  wordCount,
}: FooterProps) {
  const timerLabel =
    timerStatus === "idle"
      ? `${timerDurationMinutes} min`
      : `${formatTime(elapsedSeconds)} / ${timerDurationMinutes}:00`;
  const timerTitle =
    timerStatus === "idle"
      ? "Change timer length"
      : timerStatus === "running"
        ? "Pause timer"
        : "Resume timer";
  const updateLabel =
    updateStatus === "checking"
      ? "Checking"
      : updateStatus === "installing"
        ? "Installing"
        : updateStatus === "current"
          ? "Up to Date"
          : "Update";
  const updateDisabled =
    updateStatus === "checking" || updateStatus === "installing";

  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 select-none border-t bg-background/90 px-4 py-3 text-muted-foreground backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-3 text-sm sm:text-base">
        <span>{wordCount} words</span>

        <div className="flex items-center gap-2">
          <ToolbarButton
            active={timerStatus !== "idle"}
            aria-label={timerTitle}
            onClick={onToggleTimer}
            title={timerTitle}
          >
            <Clock className="size-4" />
            {timerLabel}
          </ToolbarButton>
          {timerStatus === "idle" ? (
            <ToolbarButton onClick={onStartTimer}>
              <Play className="size-4" />
              Start
            </ToolbarButton>
          ) : (
            <>
              <ToolbarButton onClick={onToggleTimer}>
                {timerStatus === "running" ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
                {timerStatus === "running" ? "Pause" : "Resume"}
              </ToolbarButton>
              <ToolbarButton onClick={onResetTimer}>
                <RotateCcw className="size-4" />
                Reset
              </ToolbarButton>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ToolbarButton disabled={updateDisabled} onClick={onUpdate}>
            <Download className="size-4" />
            {updateLabel}
          </ToolbarButton>
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
      {updateStatus === "error" ? (
        <p className="mx-auto mt-2 max-w-7xl text-xs text-destructive">
          Update check failed.
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
        props.disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
        className,
      )}
      type="button"
      {...props}
    />
  );
}
