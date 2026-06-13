import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect, useMemo, useState } from "react";

import { Footer } from "@/components/freewrite/Footer";
import { HistoryView } from "@/components/freewrite/HistoryView";
import type { Entry } from "@/components/freewrite/types";
import { WriteView } from "@/components/freewrite/WriteView";

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
    if (import.meta.env.DEV) {
      return;
    }

    check()
      .then(async (update) => {
        if (!update) {
          return;
        }

        await update.downloadAndInstall();
        await relaunch();
      })
      .catch((error) => {
        console.warn("Update check failed", error);
      });
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
          <WriteView content={content} onContentChange={setContent} />
        ) : (
          <HistoryView
            entries={entries}
            onDeleteEntry={deleteEntry}
            onNewEntry={startNewEntry}
            onOpenEntry={openEntry}
          />
        )}

        <Footer
          activeView={activeView}
          elapsedSeconds={elapsedSeconds}
          onNewEntry={startNewEntry}
          onToggleHistory={() =>
            setActiveView((view) => (view === "history" ? "write" : "history"))
          }
          storageError={storageError}
          wordCount={wordCount}
        />
      </main>
    </div>
  );
}

export default App;
