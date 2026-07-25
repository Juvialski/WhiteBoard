import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Plus, Clock, Timer as TimerIcon, Volume2, VolumeX, X, Minus, Sparkles } from 'lucide-react';

interface WorkspaceTimerProps {
  isOpen: boolean;
  onClose: () => void;
  // Optional sync callbacks
  onTimerSync?: (state: { isRunning: boolean; mode: 'timer' | 'stopwatch'; remainingSeconds: number; totalSeconds: number }) => void;
  syncedState?: { isRunning: boolean; mode: 'timer' | 'stopwatch'; remainingSeconds: number; totalSeconds: number } | null;
}

export default function WorkspaceTimer({ isOpen, onClose, onTimerSync, syncedState }: WorkspaceTimerProps) {
  const [mode, setMode] = useState<'timer' | 'stopwatch'>('timer');
  const [totalSeconds, setTotalSeconds] = useState<number>(300); // 5 mins default
  const [remainingSeconds, setRemainingSeconds] = useState<number>(300);
  const [stopwatchSeconds, setStopwatchSeconds] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);

  // Sync with remote timer if broadcasted
  useEffect(() => {
    if (syncedState) {
      setIsRunning(syncedState.isRunning);
      setMode(syncedState.mode);
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

  // Main tick timer loop
  useEffect(() => {
    let interval: any = null;
    if (isRunning) {
      interval = setInterval(() => {
        if (mode === 'timer') {
          setRemainingSeconds((prev) => {
            if (prev <= 1) {
              setIsRunning(false);
              playSoundAlert();
              return 0;
            }
            if (prev % 5 === 0 && onTimerSync) {
              onTimerSync({
                isRunning: true,
                mode: 'timer',
                remainingSeconds: prev - 1,
                totalSeconds
              });
            }
            return prev - 1;
          });
        } else {
          setStopwatchSeconds((prev) => {
            if (prev % 5 === 0 && onTimerSync) {
              onTimerSync({
                isRunning: true,
                mode: 'stopwatch',
                remainingSeconds: prev + 1,
                totalSeconds
              });
            }
            return prev + 1;
          });
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, mode, soundEnabled, onTimerSync, totalSeconds]);

  if (!isOpen) return null;

  const handleStartPause = () => {
    const nextState = !isRunning;
    setIsRunning(nextState);
    if (onTimerSync) {
      onTimerSync({
        isRunning: nextState,
        mode,
        remainingSeconds: mode === 'timer' ? remainingSeconds : stopwatchSeconds,
        totalSeconds
      });
    }
  };

  const handleReset = () => {
    setIsRunning(false);
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
        totalSeconds
      });
    }
  };

  const handlePreset = (seconds: number) => {
    setIsRunning(false);
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
    setMode('timer');
  };

  const handleAddMinute = () => {
    if (mode === 'timer') {
      setRemainingSeconds((prev) => prev + 60);
      setTotalSeconds((prev) => prev + 60);
    } else {
      setStopwatchSeconds((prev) => prev + 60);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Progress ring math
  const progress = mode === 'timer' && totalSeconds > 0 ? (remainingSeconds / totalSeconds) : 1;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  // Ring status color
  const ringColor = mode === 'timer' && remainingSeconds <= 10
    ? 'text-rose-500'
    : mode === 'timer' && remainingSeconds <= 30
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
                <span className="text-2xl font-black font-mono tracking-tight text-slate-900">
                  {formatTime(mode === 'timer' ? remainingSeconds : stopwatchSeconds)}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {mode === 'timer' ? (isRunning ? 'Remaining' : 'Paused') : 'Elapsed'}
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
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                title="Reset Timer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={handleAddMinute}
                className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-extrabold transition-colors cursor-pointer flex items-center space-x-0.5"
                title="Add +1 Minute"
              >
                <span>+1m</span>
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
