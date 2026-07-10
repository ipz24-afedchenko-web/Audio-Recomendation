import { useTheme } from './ThemeContext';

export function useChartTheme() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return {
    paper_bgcolor: isDark ? '#1e1e2e' : '#ffffff',
    plot_bgcolor: isDark ? '#1e1e2e' : '#ffffff',
    font: { color: isDark ? '#cdd6f4' : '#1e1e2e' },
  };
}