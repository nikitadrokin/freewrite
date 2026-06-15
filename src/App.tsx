import { invoke } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { useEffect, useMemo, useState } from 'react';

import { Footer } from '@/components/freewrite/Footer';
import { HistoryView } from '@/components/freewrite/HistoryView';
import type { Entry } from '@/components/freewrite/types';
import { WriteView } from '@/components/freewrite/WriteView';

type TimerStatus = 'idle' | 'running' | 'paused';
type UpdateStatus = 'idle' | 'checking' | 'current' | 'installing' | 'error';

async function safeInvoke<T>(command: string, args?: Record<string, unknown>) {
  return invoke<T>(command, args);
}

function App() {
  const [activeView, setActiveView] = useState<'write' | 'history'>('write');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerStatus, setTimerStatus] = useState<TimerStatus>('idle');
  const [timerDurationMinutes, setTimerDurationMinutes] = useState(15);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');

  const wordCount = useMemo(
    () => content.trim().split(/\s+/).filter(Boolean).length,
    [content],
  );

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  const installAvailableUpdate = async (showCurrentStatus: boolean) => {
    setUpdateStatus('checking');

    try {
      const update = await check();

      if (!update) {
        setUpdateStatus(showCurrentStatus ? 'current' : 'idle');
        return;
      }

      setUpdateStatus('installing');
      await update.downloadAndInstall();
      await relaunch();
    } catch (error) {
      setUpdateStatus('error');
      console.warn('Update check failed', error);
    }
  };

  useEffect(() => {
    if (import.meta.env.DEV) {
      return;
    }

    void installAvailableUpdate(false);
  }, []);

  useEffect(() => {
    safeInvoke<Entry[]>('list_entries')
      .then(setEntries)
      .catch((error) => setStorageError(String(error)));
  }, []);

  useEffect(() => {
    if (timerStatus !== 'running') {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((seconds) => {
        const nextSeconds = seconds + 1;
        const durationSeconds = timerDurationMinutes * 60;

        if (nextSeconds >= durationSeconds) {
          window.clearInterval(timer);
          setTimerStatus('paused');
          return durationSeconds;
        }

        return nextSeconds;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [timerDurationMinutes, timerStatus]);

  useEffect(() => {
    if (!content.trim()) {
      return;
    }

    const timeout = window.setTimeout(() => {
      safeInvoke<Entry>('save_entry', { id: entryId, content })
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
    setContent('');
    setElapsedSeconds(0);
    setTimerStatus('idle');
    setActiveView('write');
  };

  const openEntry = (entry: Entry) => {
    setEntryId(entry.id);
    setContent(entry.content);
    setElapsedSeconds(0);
    setTimerStatus('idle');
    setActiveView('write');
  };

  const cycleTimerDuration = () => {
    const durations = [5, 10, 15, 20, 25, 30];
    const currentIndex = durations.indexOf(timerDurationMinutes);
    const nextIndex =
      currentIndex === durations.length - 1 ? 0 : currentIndex + 1;

    setTimerDurationMinutes(durations[nextIndex]);
  };

  const startTimer = () => {
    setElapsedSeconds(0);
    setTimerStatus('running');
  };

  const toggleTimer = () => {
    if (timerStatus === 'idle') {
      cycleTimerDuration();
      return;
    }

    setTimerStatus((status) => (status === 'running' ? 'paused' : 'running'));
  };

  const resetTimer = () => {
    setElapsedSeconds(0);
    setTimerStatus('idle');
  };

  const deleteEntry = (id: string) => {
    safeInvoke<void>('delete_entry', { id })
      .then(() => {
        setEntries((current) => current.filter((entry) => entry.id !== id));
        if (entryId === id) {
          startNewEntry();
        }
      })
      .catch((error) => setStorageError(String(error)));
  };

  return (
    <div className='relative min-h-dvh overflow-hidden bg-background text-foreground antialiased'>
      <div
        data-tauri-drag-region
        className='fixed inset-x-0 top-0 z-50 h-8 w-full bg-background'
      />
      <div className='texture' />
      <main className='relative z-10 flex h-dvh flex-col'>
        {activeView === 'write' ? (
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
          onResetTimer={resetTimer}
          onStartTimer={startTimer}
          onToggleTimer={toggleTimer}
          onUpdate={() => installAvailableUpdate(true)}
          onToggleHistory={() =>
            setActiveView((view) => (view === 'history' ? 'write' : 'history'))
          }
          storageError={storageError}
          timerDurationMinutes={timerDurationMinutes}
          timerStatus={timerStatus}
          updateStatus={updateStatus}
          wordCount={wordCount}
        />
      </main>
    </div>
  );
}

export default App;
