import { useEffect, useState } from 'react';
import { useTheme } from './ThemeContext';

/**
 * Reads the design tokens declared as CSS custom properties so that Plotly
 * (which cannot consume CSS variables directly) mirrors the active theme.
 * Recomputed whenever the theme flips so charts re-colour instantly.
 */
export function useChartTheme() {
  const { theme } = useTheme();
  const [tokens, setTokens] = useState(readTokens);

  useEffect(() => {
    const id = requestAnimationFrame(() => setTokens(readTokens()));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  return tokens;
}

function readTokens() {
  const style = getComputedStyle(document.documentElement);
  const get = (name, fallback) => {
    const value = style.getPropertyValue(name);
    return value ? value.trim() : fallback;
  };
  return {
    accent: get('--accent', '#0d7d6e'),
    accentSoft: get('--accent-soft', 'rgba(13, 125, 110, 0.18)'),
    danger: get('--danger', '#d64545'),
    dangerSoft: get('--danger-soft', 'rgba(214, 69, 69, 0.16)'),
    text: get('--text-secondary', '#6b6b73'),
    textMuted: get('--text-muted', '#9a9aa2'),
    border: get('--border', '#e6e4df'),
    borderLight: get('--border-light', '#d8d6d0'),
    card: get('--bg-card', '#ffffff'),
    font: get('--font', 'system-ui, sans-serif'),
  };
}

export default useChartTheme;
