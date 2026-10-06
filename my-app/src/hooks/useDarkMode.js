import { useCallback, useState } from 'react';

export function useDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );

  /**
   * Toggles dark mode.
   */
  const onToggleDarkMode = useCallback(() => {
    const el = document.documentElement;

    if (el.getAttribute('data-theme') === 'dark') {
      el.removeAttribute('data-theme');
      setIsDarkMode(false);
    } else {
      el.setAttribute('data-theme', 'dark');
      setIsDarkMode(true);
    }
  }, []);

  return { isDarkMode, onToggleDarkMode };
}
