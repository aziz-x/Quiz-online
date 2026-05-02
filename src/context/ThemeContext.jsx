import { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const ThemeContext = createContext();

const ThemeContextProvider = (props) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    // Default to dark mode
    return true;
  });

  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    // Update localStorage and document class when theme changes
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.setProperty('--bg-primary', 'linear-gradient(135deg,#080d1a 0%,#0f172a 40%,#0a0f1f 100%)');
      document.documentElement.style.setProperty('--bg-secondary', 'rgba(15,23,42,0.85)');
      document.documentElement.style.setProperty('--bg-card', 'rgba(15,23,42,0.9)');
      document.documentElement.style.setProperty('--text-primary', '#e2e8f0');
      document.documentElement.style.setProperty('--text-secondary', '#94a3b8');
      document.documentElement.style.setProperty('--text-accent', '#c4b5fd');
      document.documentElement.style.setProperty('--border-color', 'rgba(139,92,246,0.3)');
      document.documentElement.style.setProperty('--input-bg', 'rgba(30,41,59,0.8)');
      document.documentElement.style.setProperty('--button-primary', '#8b5cf6');
      document.documentElement.style.setProperty('--button-secondary', '#06b6d4');
      document.documentElement.style.setProperty('--error-color', '#ef4444');
      document.documentElement.style.setProperty('--success-color', '#22c55e');
      document.documentElement.style.setProperty('--warning-color', '#fbbf24');
      
      document.body.style.background = 'linear-gradient(135deg, #080d1a 0%, #0f172a 40%, #0a0f1f 100%)';
      document.body.style.color = '#e2e8f0';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.setProperty('--bg-primary', 'linear-gradient(135deg,#f8fafc 0%,#f1f5f9 40%,#e2e8f0 100%)');
      document.documentElement.style.setProperty('--bg-secondary', 'rgba(255,255,255,0.8)');
      document.documentElement.style.setProperty('--bg-card', 'rgba(255,255,255,0.95)');
      document.documentElement.style.setProperty('--text-primary', '#0f172a');
      document.documentElement.style.setProperty('--text-secondary', '#475569');
      document.documentElement.style.setProperty('--text-accent', '#6366f1');
      document.documentElement.style.setProperty('--border-color', 'rgba(0,0,0,0.1)');
      document.documentElement.style.setProperty('--input-bg', '#ffffff');
      document.documentElement.style.setProperty('--button-primary', '#4f46e5');
      document.documentElement.style.setProperty('--button-secondary', '#0ea5e9');
      document.documentElement.style.setProperty('--error-color', '#dc2626');
      document.documentElement.style.setProperty('--success-color', '#16a34a');
      document.documentElement.style.setProperty('--warning-color', '#d97706');

      document.body.style.background = 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)';
      document.body.style.color = '#0f172a';
    }
    
    console.log('Theme changed to:', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleTheme = useCallback(() => {
    if (isToggling) return; // Prevent rapid clicking
    
    setIsToggling(true);
    setIsDarkMode(prev => !prev);
    
    // Reset toggling state after a short delay
    setTimeout(() => {
      setIsToggling(false);
    }, 300);
  }, [isToggling]);

  const value = {
    isDarkMode,
    toggleTheme,
    isToggling
  };

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  );
};

export default ThemeContextProvider;
