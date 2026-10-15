/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Plus Jakarta Sans', 'sans-serif'],
      },
      colors: {
        dark: {
          bg: '#080d19',
          surface: '#0f172a',
          card: '#11192d',
          border: 'rgba(51, 65, 85, 0.45)',
          muted: '#64748b',
        },
      },
    },
  },
  plugins: [],
}
