import {
  Clock,
  Download,
  History,
  Pause,
  Play,
  Plus,
  RotateCcw,
} from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

import { formatTime } from './format';

type FooterProps = {
  activeView: 'write' | 'history';
  elapsedSeconds: number;
  onNewEntry: () => void;
  onResetTimer: () => void;
  onStartTimer: () => void;
  onToggleTimer: () => void;
  onToggleHistory: () => void;
  onUpdate: () => void;
  storageError: string | null;
  timerDurationMinutes: number;
  timerStatus: 'idle' | 'running' | 'paused';
  updateStatus: 'idle' | 'checking' | 'current' | 'installing' | 'error';
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
    timerStatus === 'idle'
      ? `${timerDurationMinutes} min`
      : `${formatTime(elapsedSeconds)} / ${timerDurationMinutes}:00`;
  const timerTitle =
    timerStatus === 'idle'
      ? 'Change timer length'
      : timerStatus === 'running'
      ? 'Pause timer'
      : 'Resume timer';
  const updateLabel =
    updateStatus === 'checking'
      ? 'Checking'
      : updateStatus === 'installing'
      ? 'Installing'
      : updateStatus === 'current'
      ? 'Up to Date'
      : 'Update';
  const updateDisabled =
    updateStatus === 'checking' || updateStatus === 'installing';
  const pauseResumeLabel =
    timerStatus === 'running' ? 'Pause' : 'Resume';

  return (
    <footer className='z-20 select-none border-t px-4 py-2 text-muted-foreground'>
      <div className='mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm'>
        <span>{wordCount} words</span>

        <div className='flex items-center gap-1'>
          <ToolbarButton
            active={timerStatus !== 'idle'}
            aria-label={timerTitle}
            onClick={onToggleTimer}
            title={timerTitle}
          >
            <Clock className='size-4' />
            {timerLabel}
          </ToolbarButton>
          {timerStatus === 'idle' ? (
            <ToolbarButton
              aria-label='Start timer'
              iconOnly
              onClick={onStartTimer}
              title='Start timer'
            >
              <Play className='size-4' />
            </ToolbarButton>
          ) : (
            <>
              <ToolbarButton
                aria-label={`${pauseResumeLabel} timer`}
                iconOnly
                onClick={onToggleTimer}
                title={`${pauseResumeLabel} timer`}
              >
                {timerStatus === 'running' ? (
                  <Pause className='size-4' />
                ) : (
                  <Play className='size-4' />
                )}
              </ToolbarButton>
              <ToolbarButton
                aria-label='Reset timer'
                iconOnly
                onClick={onResetTimer}
                title='Reset timer'
              >
                <RotateCcw className='size-4' />
              </ToolbarButton>
            </>
          )}
        </div>

        <div className='flex items-center gap-1'>
          <ToolbarButton
            aria-label={updateLabel}
            disabled={updateDisabled}
            iconOnly
            onClick={onUpdate}
            title={updateLabel}
          >
            <Download className='size-4' />
          </ToolbarButton>
          <ToolbarButton
            aria-label='New entry'
            iconOnly
            onClick={onNewEntry}
            title='New entry'
          >
            <Plus className='size-4' />
          </ToolbarButton>
          <ToolbarButton
            active={activeView === 'history'}
            aria-label='History'
            iconOnly
            onClick={onToggleHistory}
            title='History'
          >
            <History className='size-4' />
          </ToolbarButton>
        </div>
      </div>
      {storageError ? (
        <p className='mx-auto mt-2 max-w-7xl text-xs text-destructive'>
          Storage unavailable: {storageError}
        </p>
      ) : null}
      {updateStatus === 'error' ? (
        <p className='mx-auto mt-2 max-w-7xl text-xs text-destructive'>
          Update check failed.
        </p>
      ) : null}
    </footer>
  );
}

function ToolbarButton({
  active = false,
  children,
  className,
  iconOnly = false,
  ...props
}: ComponentProps<'button'> & { active?: boolean; iconOnly?: boolean }) {
  return (
    <button
      className={cn(
        'inline-flex items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        iconOnly
          ? 'size-8 shrink-0 justify-center'
          : 'h-8 gap-2 px-2',
        active && 'bg-accent text-accent-foreground',
        props.disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent',
        className,
      )}
      type='button'
      {...props}
    >
      {children}
    </button>
  );
}
