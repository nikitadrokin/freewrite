import { Trash2 } from "lucide-react";

import { formatEntryDate } from "./format";
import type { Entry } from "./types";

type HistoryViewProps = {
  entries: Entry[];
  onDeleteEntry: (id: number) => void;
  onNewEntry: () => void;
  onOpenEntry: (entry: Entry) => void;
};

export function HistoryView({
  entries,
  onDeleteEntry,
  onNewEntry,
  onOpenEntry,
}: HistoryViewProps) {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-5 pb-24 pt-8 sm:px-10 md:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-left text-2xl font-bold">History</h1>
          </div>
          <button
            className="rounded-md border bg-card px-3 py-2 text-sm shadow-xs hover:bg-accent"
            onClick={onNewEntry}
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
                    onClick={() => onOpenEntry(entry)}
                    type="button"
                  >
                    {formatEntryDate(entry.updated_at)} · {entry.word_count}{" "}
                    words
                  </button>
                  <button
                    aria-label="Delete entry"
                    className="rounded-md p-2 opacity-70 hover:bg-accent hover:opacity-100"
                    onClick={() => onDeleteEntry(entry.id)}
                    type="button"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <button
                  className="line-clamp-3 w-full text-left font-serif text-lg leading-8"
                  onClick={() => onOpenEntry(entry)}
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
  );
}

