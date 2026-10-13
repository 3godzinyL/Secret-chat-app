
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0a0a',
        onyx: '#0e0a0d',
        wine: '#180a10',
        mulberry: '#3a1024',
        crimson: '#b5174a',
        mist: '#f3f0f6'
      },
      boxShadow: { glow: '0 0 50px rgba(181,23,74,0.25)' },
      borderRadius: { xl2: '1rem' }
    }
  },
  plugins: []
}
