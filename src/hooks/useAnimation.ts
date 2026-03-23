import { useState, useEffect, useRef, useCallback } from 'react';
import type { AnimationSpeed } from '../types';

const LOOP_LENGTH = 1800; // ms for one full loop at speed 1

export function useAnimation(timeRange: [number, number]) {
  const [currentTime, setCurrentTime] = useState(timeRange[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<AnimationSpeed>(0.5);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const [minTime, maxTime] = timeRange;
  const duration = maxTime - minTime;

  const animate = useCallback((timestamp: number) => {
    if (lastTimeRef.current === null) {
      lastTimeRef.current = timestamp;
    }
    const delta = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    setCurrentTime(prev => {
      const step = (delta / LOOP_LENGTH) * duration * speed;
      const next = prev + step;
      return next > maxTime ? minTime : next;
    });

    rafRef.current = requestAnimationFrame(animate);
  }, [duration, maxTime, minTime, speed]);

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = null;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, animate]);

  // Reset when timeRange changes
  useEffect(() => {
    setCurrentTime(timeRange[0]);
  }, [timeRange[0]]);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);

  const stepForward = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(prev => Math.min(prev + 1, maxTime));
  }, [maxTime]);

  const stepBackward = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(prev => Math.max(prev - 1, minTime));
  }, [minTime]);

  const seek = useCallback((time: number) => {
    setCurrentTime(Math.max(minTime, Math.min(maxTime, time)));
  }, [minTime, maxTime]);

  return {
    currentTime,
    isPlaying,
    speed,
    setSpeed,
    play,
    pause,
    togglePlay,
    stepForward,
    stepBackward,
    seek,
    minTime,
    maxTime,
  };
}
