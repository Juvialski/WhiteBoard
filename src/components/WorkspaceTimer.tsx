import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Plus, Clock, Timer as TimerIcon, Volume2, VolumeX, X, Minus, Sparkles } from 'lucide-react';

interface WorkspaceTimerProps {
  isOpen: boolean;
  onClose: () => void;
  // Optional sync callbacks
  onTimerSync?: (state: { isRunning: boolean; mode: 'timer' | 'stopwatch'; remainingSeconds: number; totalSeconds: number; startedAt?: number | null }) => void;
  syncedState?: { isRunning: boolean; mode: 'timer' | 'stopwatch'; remainingSeconds: number; totalSeconds: number; startedAt?: number | null } | null;
}

export default function WorkspaceTimer({ isOpen, onClose, onTimerSync, syncedState }: WorkspaceTimerProps) {
  const [mode, setMode] = useState<'timer' | 'stopwatch'>('timer');
  const [totalSeconds, setTotalSeconds] = useState<number>(300); // 5 mins default
  const [remainingSeconds, setRemainingSeconds] = useState<number>(300);
  const [stopwatchSeconds, setStopwatchSeconds] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [tick, setTick] = useState<number>(0);

  const audioCtxRef = useRef<AudioContext | null>(null);

  // Sync with remote timer if broadcasted
  useEffect(() => {
    if (syncedState) {
      setIsRunning(syncedState.isRunning);
      setMode(syncedState.mode);
      setStartedAt(syncedState.startedAt ?? null);
      if (syncedState.mode === 'timer') {
        setRemainingSeconds(syncedState.remainingSeconds);
        setTotalSeconds(syncedState.totalSeconds);
      } else {
        setStopwatchSeconds(syncedState.remainingSeconds);
      }
    }
  }, [syncedState]);

  // Audio synthesizer for sound alert when countdown finishes
  const playSoundAlert = () => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      // Play a pleasant double-chime bell chord (E5 & B5 then G#5)
      const freqs = [659.25, 987.77, 830.61];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);
        gain.gain.setValueAtTime(0.3, now + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.8);
      });
    } catch (e) {
      console.error('Audio alert playback error:', e);
    }
  };

  // Calculate current seconds dynamically for ultra-accurate rendering
  const getCurrentDisplaySeconds = () => {
    if (!isRunning || !startedAt) {
      return mode === 'timer' ? remainingSeconds : stopwatchSeconds;
    }
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    if (mode === 'timer') {
      return Math.max(0, remainingSeconds - elapsed);
    } else {
      return stopwatchSeconds + elapsed;
    }
  };

  // Main tick timer loop and completion notifier
  useEffect(() => {
    let interval: any = null;
    if (isRunning) {
      interval = setInterval(() => {
        setTick((t) => t + 1);

        // Check if the countdown timer has completed
        if (mode === 'timer' && startedAt) {
          const elapsed = Math.floor((Date.now() - startedAt) / 1000);
          const currentLeft = Math.max(0, remainingSeconds - elapsed);
          if (currentLeft <= 0) {
            setIsRunning(false);
            setStartedAt(null);
            setRemainingSeconds(0);
            playSoundAlert();
            if (onTimerSync) {
              onTimerSync({
                isRunning: false,
                mode: 'timer',
                remainingSeconds: 0,
                totalSeconds,
                startedAt: null
              });
            }
          }
        }
      }, 200); // Check 5 times a second for flawless precision
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, startedAt, mode, remainingSeconds, totalSeconds, onTimerSync]);

  if (!isOpen) return null;

  const handleStartPause = () => {
    const nextIsRunning = !isRunning;
    const now = Date.now();
    const nextStartedAt = nextIsRunning ? now : null;

    setIsRunning(nextIsRunning);
    setStartedAt(nextStartedAt);

    let currentRemaining = remainingSeconds;
    let currentStopwatch = stopwatchSeconds;

    if (!nextIsRunning) {
      // Freeze at precisely calculated current values
      if (startedAt) {
        const elapsed = Math.floor((now - startedAt) / 1000);
        if (mode === 'timer') {
          currentRemaining = Math.max(0, remainingSeconds - elapsed);
        } else {
          currentStopwatch = stopwatchSeconds + elapsed;
        }
      }
      setRemainingSeconds(currentRemaining);
      setStopwatchSeconds(currentStopwatch);
    }

    if (onTimerSync) {
      onTimerSync({
        isRunning: nextIsRunning,
        mode,
        remainingSeconds: mode === 'timer' ? currentRemaining : currentStopwatch,
        totalSeconds,
        startedAt: nextStartedAt
      });
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    setStartedAt(null);
    if (mode === 'timer') {
      setRemainingSeconds(totalSeconds);
    } else {
      setStopwatchSeconds(0);
    }
    if (onTimerSync) {
      onTimerSync({
        isRunning: false,
        mode,
        remainingSeconds: mode === 'timer' ? totalSeconds : 0,
        totalSeconds,
        startedAt: null
      });
    }
  };

  const handlePreset = (seconds: number) => {
    setIsRunning(false);
    setStartedAt(null);
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
    setMode('timer');
    if (onTimerSync) {
      onTimerSync({
        isRunning: false,
        mode: 'timer',
        remainingSeconds: seconds,
        totalSeconds: seconds,
        startedAt: null
      });
    }
  };

  const handleAddSeconds = (secs: number) => {
    const now = Date.now();

    if (mode === 'timer') {
      let currentLeft = remainingSeconds;
      if (isRunning && startedAt) {
        const elapsed = Math.floor((now - startedAt) / 1000);
        currentLeft = Math.max(0, remainingSeconds - elapsed);
      }

      const next = Math.max(0, currentLeft + secs);
      const nextTotal = Math.max(next, totalSeconds + (secs > 0 ? secs : 0));

      setRemainingSeconds(next);
      setTotalSeconds(nextTotal);
      if (isRunning) {
        setStartedAt(now);
      }

      if (onTimerSync) {
        onTimerSync({
          isRunning,
          mode: 'timer',
          remainingSeconds: next,
          totalSeconds: nextTotal,
          startedAt: isRunning ? now : null
        });
      }
    } else {
      let currentStopwatch = stopwatchSeconds;
      if (isRunning && startedAt) {
        const elapsed = Math.floor((now - startedAt) / 1000);
        currentStopwatch = stopwatchSeconds + elapsed;
      }

      const next = Math.max(0, currentStopwatch + secs);
      setStopwatchSeconds(next);
      if (isRunning) {
        setStartedAt(now);
      }

      if (onTimerSync) {
        onTimerSync({
          isRunning,
          mode: 'stopwatch',
          remainingSeconds: next,
          totalSeconds,
          startedAt: isRunning ? now : null
        });
      }
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentDisplaySeconds = getCurrentDisplaySeconds();

  // Progress ring math
  const progress = mode === 'timer' && totalSeconds > 0 ? (currentDisplaySeconds / totalSeconds) : 1;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  // Ring status color
  const ringColor = mode === 'timer' && currentDisplaySeconds <= 10
    ? 'text-rose-500'
    : mode === 'timer' && currentDisplaySeconds <= 30
    ? 'text-amber-500'
    : 'text-indigo-600';

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-scale-up select-none pointer-events-auto">
      <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-2xl rounded-3xl overflow-hidden w-72 transition-all">
        {/* Header Bar */}
        <div className="bg-slate-900 text-white px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TimerIcon className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span className="text-xs font-bold tracking-wide uppercase text-slate-200">
              Sprint Timer
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={soundEnabled ? 'Mute Sound Alert' : 'Enable Sound Alert'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-rose-400" />}
            </button>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={isMinimized ? 'Expand Timer' : 'Minimize Timer'}
            >
              {isMinimized ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-rose-900/50 hover:text-rose-300 rounded-lg text-slate-400 transition-colors cursor-pointer"
              title="Close Timer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <div className="p-4 flex flex-col items-center">
            {/* Mode Selector Tabs */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl w-full mb-3 text-xs font-bold">
              <button
                onClick={() => {
                  setMode('timer');
                  setIsRunning(false);
                  setStartedAt(null);
                }}
                className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                  mode === 'timer' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Timer
              </button>
              <button
                onClick={() => {
                  setMode('stopwatch');
                  setIsRunning(false);
                  setStartedAt(null);
                }}
                className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                  mode === 'stopwatch' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Stopwatch
              </button>
            </div>

            {/* Circular Progress Display */}
            <div className="relative w-28 h-28 flex items-center justify-center my-1">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  className="stroke-slate-100"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  className={`${ringColor} transition-all duration-500`}
                  strokeWidth="6"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                {mode === 'timer' && !isRunning ? (
                  <div className="flex items-center space-x-0.5 text-2xl font-black font-mono tracking-tight text-slate-900 bg-slate-50/70 rounded-lg px-1.5 py-0.5 border border-slate-200/50">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        const mins = Math.min(99, Math.max(0, parseInt(val) || 0));
                        const secs = remainingSeconds % 60;
                        const next = mins * 60 + secs;
                        setRemainingSeconds(next);
                        setTotalSeconds(next);
                        if (onTimerSync) {
                          onTimerSync({ isRunning: false, mode: 'timer', remainingSeconds: next, totalSeconds: next, startedAt: null });
                        }
                      }}
                      className="w-8 text-center bg-transparent border-none focus:outline-none focus:bg-indigo-50/80 rounded font-mono font-black"
                      title="Set minutes"
                    />
                    <span className="animate-pulse text-indigo-500/70">:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={(remainingSeconds % 60).toString().padStart(2, '0')}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        const mins = Math.floor(remainingSeconds / 60);
                        const secs = Math.min(59, Math.max(0, parseInt(val) || 0));
                        const next = mins * 60 + secs;
                        setRemainingSeconds(next);
                        setTotalSeconds(next);
                        if (onTimerSync) {
                          onTimerSync({ isRunning: false, mode: 'timer', remainingSeconds: next, totalSeconds: next, startedAt: null });
                        }
                      }}
                      className="w-8 text-center bg-transparent border-none focus:outline-none focus:bg-indigo-50/80 rounded font-mono font-black"
                      title="Set seconds"
                    />
                  </div>
                ) : (
                  <span className="text-2xl font-black font-mono tracking-tight text-slate-900">
                    {formatTime(currentDisplaySeconds)}
                  </span>
                )}
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                  {mode === 'timer' ? (isRunning ? 'Remaining' : 'Edit Time') : 'Elapsed'}
                </span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center space-x-2 mt-3 w-full">
              <button
                onClick={handleStartPause}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer ${
                  isRunning
                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                }`}
              >
                {isRunning ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start</span>
                  </>
                )}
              </button>

              <button
                onClick={handleReset}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer flex items-center justify-center space-x-1"
                title="Reset Timer"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="text-xs font-bold">Reset</span>
              </button>
            </div>

            {/* Quick Adjustments Subtraction & Addition Bar */}
            <div className="grid grid-cols-4 gap-1.5 w-full mt-3">
              <button
                onClick={() => handleAddSeconds(-60)}
                disabled={mode === 'timer' && currentDisplaySeconds < 60}
                className="py-1 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                title="Subtract 1 Minute"
              >
                -1m
              </button>
              <button
                onClick={() => handleAddSeconds(-10)}
                disabled={mode === 'timer' && currentDisplaySeconds < 10}
                className="py-1 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                title="Subtract 10 Seconds"
              >
                -10s
              </button>
              <button
                onClick={() => handleAddSeconds(10)}
                className="py-1 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                title="Add 10 Seconds"
              >
                +10s
              </button>
              <button
                onClick={() => handleAddSeconds(60)}
                className="py-1 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                title="Add 1 Minute"
              >
                +1m
              </button>
            </div>

            {/* Presets (Timer Mode only) */}
            {mode === 'timer' && (
              <div className="grid grid-cols-4 gap-1.5 w-full mt-3 pt-3 border-t border-slate-100">
                {[
                  { label: '1m', secs: 60 },
                  { label: '3m', secs: 180 },
                  { label: '5m', secs: 300 },
                  { label: '10m', secs: 600 },
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => handlePreset(p.secs)}
                    className={`py-1 rounded-lg text-xs font-extrabold border transition-all cursor-pointer ${
                      totalSeconds === p.secs
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
