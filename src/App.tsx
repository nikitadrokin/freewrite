import { invoke } from "@tauri-apps/api/core";
import { Clock, History, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Entry = {
  id: number;
  content: string;
  created_at: number;
  updated_at: number;
  word_count: number;
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatEntryDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

async function safeInvoke<T>(command: string, args?: Record<string, unknown>) {
  return invoke<T>(command, args);
}

function App() {
  const [activeView, setActiveView] = useState<"write" | "history">("write");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryId, setEntryId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [storageError, setStorageError] = useState<string | null>(null);

  const wordCount = useMemo(
    () => content.trim().split(/\s+/).filter(Boolean).length,
    [content],
  );

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    safeInvoke<Entry[]>("list_entries")
      .then(setEntries)
      .catch((error) => setStorageError(String(error)));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!content.trim()) {
      return;
    }

    const timeout = window.setTimeout(() => {
      safeInvoke<Entry>("save_entry", { id: entryId, content })
        .then((entry) => {
          setEntryId(entry.id);
          setEntries((current) => {
            const withoutEntry = current.filter((item) => item.id !== entry.id);
            return [entry, ...withoutEntry];
          });
          setStorageError(null);
        })
        .catch((error) => setStorageError(String(error)));
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [content, entryId]);

  const startNewEntry = () => {
    setEntryId(null);
    setContent("");
    setElapsedSeconds(0);
    setActiveView("write");
  };

  const openEntry = (entry: Entry) => {
    setEntryId(entry.id);
    setContent(entry.content);
    setElapsedSeconds(0);
    setActiveView("write");
  };

  const deleteEntry = (id: number) => {
    safeInvoke<void>("delete_entry", { id })
      .then(() => {
        setEntries((current) => current.filter((entry) => entry.id !== id));
        if (entryId === id) {
          startNewEntry();
        }
      })
      .catch((error) => setStorageError(String(error)));
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground antialiased">
      <div className="texture" />
      <main className="relative z-10 flex h-dvh flex-col">
        {activeView === "write" ? (
          <section className="flex min-h-0 flex-1 px-5 pb-24 pt-10 sm:px-10 md:px-16 lg:px-24">
            <Textarea
              aria-label="Freewrite"
              autoFocus
              className="mx-auto h-full max-w-5xl flex-1 resize-none rounded-none border-0 bg-transparent p-0 font-serif text-2xl leading-[1.75] shadow-none focus-visible:border-0 focus-visible:ring-0 sm:text-3xl"
              onChange={(event) => setContent(event.target.value)}
              placeholder="Just start"
              spellCheck
              value={content}
            />
          </section>
        ) : (
          <section className="min-h-0 flex-1 overflow-y-auto px-5 pb-24 pt-8 sm:px-10 md:px-16">
            <div className="mx-auto max-w-5xl">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-left text-2xl font-bold">History</h1>
                </div>
                <button
                  className="rounded-md border bg-card px-3 py-2 text-sm shadow-xs hover:bg-accent"
                  onClick={startNewEntry}
                  type="button"
                >
                  New Entry
                </button>
              </div>

              {entries.length === 0 ? (
                <div className="rounded-md border bg-card p-6 text-muted-foreground shadow-xs">
                  No saved entries yet.
                </div>
              ) : (
                <div className="grid gap-3">
                  {entries.map((entry) => (
                    <article
                      className="group rounded-md border bg-card p-4 text-card-foreground shadow-xs"
                      key={entry.id}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                        <button
                          className="text-left hover:text-foreground"
                          onClick={() => openEntry(entry)}
                          type="button"
                        >
                          {formatEntryDate(entry.updated_at)} ·{" "}
                          {entry.word_count} words
                        </button>
                        <button
                          aria-label="Delete entry"
                          className="rounded-md p-2 opacity-70 hover:bg-accent hover:opacity-100"
                          onClick={() => deleteEntry(entry.id)}
                          type="button"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <button
                        className="line-clamp-3 w-full text-left font-serif text-lg leading-8"
                        onClick={() => openEntry(entry)}
                        type="button"
                      >
                        {entry.content}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 px-4 py-3 text-muted-foreground backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-3 text-sm sm:text-base">
            <span>{wordCount} words</span>

            <ToolbarButton>
              <Clock className="size-4" />
              {formatTime(elapsedSeconds)}
            </ToolbarButton>

            <div className="flex items-center gap-2">
              <ToolbarButton onClick={startNewEntry}>
                <Plus className="size-4" />
                New Entry
              </ToolbarButton>
              <ToolbarButton
                active={activeView === "history"}
                onClick={() =>
                  setActiveView((view) =>
                    view === "history" ? "write" : "history",
                  )
                }
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
      </main>
    </div>
  );
}

function ToolbarButton({
  active = false,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
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

export default App;
