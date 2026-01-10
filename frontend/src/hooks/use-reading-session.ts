import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { papersApi } from '@/lib/api/papers';

export function useReadingSession(paperId: number, isActive: boolean, currentPage: number) {
  const queryClient = useQueryClient();
  const sessionStartRef = useRef<Date | null>(null);
  const sessionStartTimeRef = useRef<Date | null>(null); // Actual start time (before pauses)
  const pagesViewedRef = useRef<Set<number>>(new Set());
  const lastPageRef = useRef<number>(currentPage);
  const lastSavedPageRef = useRef<number | null>(null);
  const isVisibleRef = useRef<boolean>(true);
  const accumulatedPausedTimeRef = useRef<number>(0); // Total paused time in ms
  const pauseStartTimeRef = useRef<Date | null>(null);
  
  // Intervals and timeouts
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPaperIdRef = useRef<number | null>(null);
  const activeSessionIdRef = useRef<number | null>(null);
  const activeSessionPaperIdRef = useRef<number | null>(null); // Track which paper the active session is for

  const [isTracking, setIsTracking] = useState(false);

  const startSessionMutation = useMutation({
    mutationFn: () => papersApi.startReadingSession(paperId),
    onSuccess: (response) => {
      sessionStartRef.current = new Date();
      sessionStartTimeRef.current = new Date();
      activeSessionIdRef.current = response.id;
      activeSessionPaperIdRef.current = paperId;
      accumulatedPausedTimeRef.current = 0;
      pauseStartTimeRef.current = null;
      pagesViewedRef.current = new Set([currentPage]);
      lastPageRef.current = currentPage;
      lastSavedPageRef.current = currentPage;
      setIsTracking(true);
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: ({ pagesViewed, lastPage }: { pagesViewed: number, lastPage: number }) => {
      const now = new Date();
      let duration = 0;
      
      if (sessionStartTimeRef.current) {
        // Calculate active reading time (excluding paused periods)
        const totalElapsed = now.getTime() - sessionStartTimeRef.current.getTime();
        let totalPaused = accumulatedPausedTimeRef.current;
        // If currently paused, add the current pause duration
        if (pauseStartTimeRef.current) {
          totalPaused += now.getTime() - pauseStartTimeRef.current.getTime();
        }
        duration = Math.floor((totalElapsed - totalPaused) / 1000 / 60); // Convert to minutes
      }

      return papersApi.endReadingSession(paperId, {
        duration_minutes: Math.max(0, duration),
        pages_viewed: pagesViewed,
        last_read_page: lastPage,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      sessionStartRef.current = null;
      sessionStartTimeRef.current = null;
      activeSessionIdRef.current = null;
      activeSessionPaperIdRef.current = null;
      accumulatedPausedTimeRef.current = 0;
      pauseStartTimeRef.current = null;
      pagesViewedRef.current.clear();
      setIsTracking(false);
    },
  });

  // For periodic last_read_page updates, we'll create a minimal session end/restart
  // Or we can just rely on the end session to save it
  // For now, we'll skip separate last_read_page updates and let end session handle it
  // This could be enhanced with a dedicated endpoint later

  // Handle window visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      const wasVisible = isVisibleRef.current;
      isVisibleRef.current = isVisible;

      // If we have an active session
      if (sessionStartTimeRef.current && isTracking) {
        if (!isVisible && wasVisible) {
          // Tab became hidden - start pause timer
          pauseStartTimeRef.current = new Date();
        } else if (isVisible && !wasVisible) {
          // Tab became visible - accumulate paused time
          if (pauseStartTimeRef.current) {
            const pausedDuration = new Date().getTime() - pauseStartTimeRef.current.getTime();
            accumulatedPausedTimeRef.current += pausedDuration;
            pauseStartTimeRef.current = null;
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    isVisibleRef.current = !document.hidden;

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isTracking]);

  // Handle paperId changes - end previous session
  // Only react to actual paperId changes, not to isActive changes
  useEffect(() => {
    const previousPaperId = prevPaperIdRef.current;
    
    // If paperId changed and we had an active session for the previous paper
    if (previousPaperId !== null && previousPaperId !== paperId && sessionStartTimeRef.current) {
      // End session for the previous paper
      const pagesViewed = pagesViewedRef.current.size;
      const lastPage = lastPageRef.current;
      const sessionPaperId = activeSessionPaperIdRef.current || previousPaperId;
      
      // Calculate duration
      const now = new Date();
      let duration = 0;
      if (sessionStartTimeRef.current) {
        const totalElapsed = now.getTime() - sessionStartTimeRef.current.getTime();
        let totalPaused = accumulatedPausedTimeRef.current;
        if (pauseStartTimeRef.current) {
          totalPaused += now.getTime() - pauseStartTimeRef.current.getTime();
        }
        duration = Math.floor((totalElapsed - totalPaused) / 1000 / 60);
      }
      
      // End session for the previous paper (fire and forget)
      papersApi.endReadingSession(sessionPaperId, {
        duration_minutes: Math.max(0, duration),
        pages_viewed: pagesViewed,
        last_read_page: lastPage,
      }).catch(() => {
        // Silently fail on error
      });
      
      // Reset session state immediately
      sessionStartRef.current = null;
      sessionStartTimeRef.current = null;
      activeSessionIdRef.current = null;
      activeSessionPaperIdRef.current = null;
      accumulatedPausedTimeRef.current = 0;
      pauseStartTimeRef.current = null;
      pagesViewedRef.current.clear();
      setIsTracking(false);
      
      // Invalidate queries for the previous paper (async, won't block)
      queryClient.invalidateQueries({ queryKey: ['paper', sessionPaperId] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
    }
    
    prevPaperIdRef.current = paperId;
  }, [paperId, queryClient]);

  // Start session when PDF becomes active
  // Only start if paperId is valid and we don't already have a session
  useEffect(() => {
    if (isActive && !sessionStartTimeRef.current && paperId && paperId > 0) {
      // Only start if we don't have an active session for this paper
      if (activeSessionPaperIdRef.current !== paperId) {
        startSessionMutation.mutate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, paperId]);

  // Track page changes - add to unique pages set
  useEffect(() => {
    if (isActive && sessionStartTimeRef.current && currentPage !== lastPageRef.current) {
      // Add current page to unique pages viewed
      pagesViewedRef.current.add(currentPage);
      lastPageRef.current = currentPage;

      // Debounced update of last_read_page (every 30 seconds)
      if (pageUpdateTimeoutRef.current) {
        clearTimeout(pageUpdateTimeoutRef.current);
      }

      // Note: We don't update last_read_page separately here since the backend
      // update endpoint doesn't support it. Instead, we rely on the periodic
      // save interval to trigger a session update, or the end session will save it.
      // This could be enhanced with a dedicated endpoint for updating last_read_page.
      lastSavedPageRef.current = currentPage;
    }

    return () => {
      if (pageUpdateTimeoutRef.current) {
        clearTimeout(pageUpdateTimeoutRef.current);
      }
    };
  }, [currentPage, isActive]);

  // Periodic auto-save (every 60 seconds) during active reading
  // For now, we'll just track - the session will be saved when it ends
  // This could be enhanced with a dedicated update endpoint to save progress
  // without ending/restarting the session
  useEffect(() => {
    if (isActive && sessionStartTimeRef.current) {
      saveIntervalRef.current = setInterval(() => {
        // Periodic checkpoint: we track the state but don't save yet
        // The session will be properly saved when it ends
        // This ensures we have the latest state available for final save
        // In the future, we could add an update endpoint here
      }, 60000); // 60 seconds

      return () => {
        if (saveIntervalRef.current) {
          clearInterval(saveIntervalRef.current);
        }
      };
    } else {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    }
  }, [isActive, sessionStartTimeRef.current]);

  // End session when PDF becomes inactive
  // Only end if we actually have an active session for this paper
  useEffect(() => {
    if (!isActive && sessionStartTimeRef.current && activeSessionPaperIdRef.current === paperId) {
      const pagesViewed = pagesViewedRef.current.size;
      const lastPage = lastPageRef.current;
      endSessionMutation.mutate({ pagesViewed, lastPage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, paperId]);

  // Note: We don't use beforeunload for saving because:
  // 1. sendBeacon doesn't work well with POST requests that need JSON bodies
  // 2. Synchronous XHR is deprecated
  // 3. The unmount cleanup should handle most cases
  // 4. If the browser crashes, data loss is acceptable for reading session tracking

  // Cleanup on unmount - end session
  useEffect(() => {
    return () => {
      if (sessionStartTimeRef.current) {
        const pagesViewed = pagesViewedRef.current.size;
        const lastPage = lastPageRef.current;
        const sessionPaperId = activeSessionPaperIdRef.current || paperId;
        
        // Calculate duration
        const now = new Date();
        let duration = 0;
        if (sessionStartTimeRef.current) {
          const totalElapsed = now.getTime() - sessionStartTimeRef.current.getTime();
          let totalPaused = accumulatedPausedTimeRef.current;
          if (pauseStartTimeRef.current) {
            totalPaused += now.getTime() - pauseStartTimeRef.current.getTime();
          }
          duration = Math.floor((totalElapsed - totalPaused) / 1000 / 60);
        }
        
        // End session directly (don't use mutation to avoid dependency issues)
        papersApi.endReadingSession(sessionPaperId, {
          duration_minutes: Math.max(0, duration),
          pages_viewed: pagesViewed,
          last_read_page: lastPage,
        }).catch(() => {
          // Silently fail - cleanup shouldn't block unmount
        });
        
        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['paper', sessionPaperId] });
        queryClient.invalidateQueries({ queryKey: ['statistics'] });
      }
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      if (pageUpdateTimeoutRef.current) {
        clearTimeout(pageUpdateTimeoutRef.current);
      }
    };
  }, [paperId, queryClient]);

  return {
    isTracking,
  };
}
