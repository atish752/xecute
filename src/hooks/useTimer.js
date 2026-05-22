import { useState, useEffect, useRef, useCallback } from 'react';

export const useTimer = ({ totalSeconds, onComplete, onBreak, breakAfterSeconds, autoStart = false }) => {
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [isPaused, setIsPaused] = useState(false);
  const [breaksDone, setBreaksDone] = useState(0);
  const startTimeRef = useRef(null);
  const pausedAtRef = useRef(null);
  const frameRef = useRef(null);
  const breakFiredRef = useRef(false);

  const lastTotalSecondsRef = useRef(totalSeconds);

  useEffect(() => {
    const diff = totalSeconds - lastTotalSecondsRef.current;
    if (diff !== 0) {
      if (!startTimeRef.current) {
        setSecondsLeft(totalSeconds);
      } else {
        setSecondsLeft(prev => Math.max(0, prev + diff));
      }
      lastTotalSecondsRef.current = totalSeconds;
    }
  }, [totalSeconds]);

  const tick = useCallback(() => {
    if (!startTimeRef.current) return;
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const remaining = Math.max(0, totalSeconds - elapsed);
    setSecondsLeft(remaining);

    if (breakAfterSeconds && !breakFiredRef.current) {
      const sessionElapsed = totalSeconds - remaining;
      if (sessionElapsed > 0 && sessionElapsed % breakAfterSeconds === 0) {
        breakFiredRef.current = true;
        setBreaksDone(b => b + 1);
        onBreak?.();
        setTimeout(() => { breakFiredRef.current = false; }, 5000);
      }
    }

    if (remaining <= 0) {
      setIsRunning(false);
      onComplete?.();
      return;
    }
    frameRef.current = requestAnimationFrame(tick);
  }, [totalSeconds, onComplete, onBreak, breakAfterSeconds]);

  useEffect(() => {
    if (isRunning && !isPaused) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      frameRef.current = requestAnimationFrame(tick);
    } else {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    }
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [isRunning, isPaused, tick]);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    setIsRunning(true);
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    pausedAtRef.current = Date.now();
    setIsPaused(true);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  const resume = useCallback(() => {
    if (pausedAtRef.current && startTimeRef.current) {
      startTimeRef.current += Date.now() - pausedAtRef.current;
    }
    setIsPaused(false);
  }, []);

  const reset = useCallback(() => {
    startTimeRef.current = null;
    pausedAtRef.current = null;
    setIsRunning(false);
    setIsPaused(false);
    setSecondsLeft(totalSeconds);
    setBreaksDone(0);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, [totalSeconds]);

  const progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0;

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return { secondsLeft, isRunning, isPaused, progress, breaksDone, start, pause, resume, reset, formatTime };
};
