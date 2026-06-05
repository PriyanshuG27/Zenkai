/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'bg-base': 'var(--bg-base)',
        'bg-oled': 'var(--bg-oled)',
        'bg-surface': 'var(--bg-surface)',
        'surface': 'var(--surface)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-input': 'var(--bg-input)',
        'primary': 'var(--primary)',
        'primary-glow': 'var(--primary-glow)',
        'secondary': 'var(--secondary)',
        'secondary-glow': 'var(--secondary-glow)',
        'accent-xp': 'var(--accent-xp)',
        'accent-lime': 'var(--accent-lime)',
        'border-base': 'var(--border)',
        'border-bright': 'var(--border-bright)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
      },
      fontFamily: {
        display: ['Barlow Condensed', 'sans-serif'],
        body: ['Outfit', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
