import { useEffect, useState } from 'react';

export const compactLayoutBreakpoint = 820;

export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(readCompactLayout);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.(`(max-width: ${compactLayoutBreakpoint}px)`);
    const update = (): void => setCompact(readCompactLayout());

    mediaQuery?.addEventListener('change', update);
    window.addEventListener('resize', update);
    update();

    return () => {
      mediaQuery?.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return compact;
}

function readCompactLayout(): boolean {
  if (document.documentElement.dataset['platform'] === 'desktop') return false;
  return (
    window.matchMedia?.(`(max-width: ${compactLayoutBreakpoint}px)`).matches ??
    window.innerWidth <= compactLayoutBreakpoint
  );
}
