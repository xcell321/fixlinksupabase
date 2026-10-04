import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// Observes the OS reduce-motion setting. When enabled, animation primitives
// render their final state instantly instead of animating.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mounted) setReduced(query.matches);
      const listener = (event: MediaQueryListEvent): void => {
        if (mounted) setReduced(event.matches);
      };
      query.addEventListener('change', listener);
      return () => {
        mounted = false;
        query.removeEventListener('change', listener);
      };
    }
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && typeof enabled === 'boolean') setReduced(enabled);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled: boolean) => {
      if (mounted) setReduced(enabled);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
