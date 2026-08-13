'use client';
import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check initial state
    setIsDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return next;
    });
  };

  return (
    <button
      onClick={toggleTheme}
      className="hover:opacity-80 transition-opacity duration-150 active:scale-[0.96] transition-transform p-2 -mr-2 text-primary dark:text-white flex items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      aria-label="Toggle theme"
    >
      {isDarkMode ? (
        <span className="material-symbols-outlined text-2xl">light_mode</span>
      ) : (
        <span className="material-symbols-outlined text-2xl">dark_mode</span>
      )}
    </button>
  );
}
