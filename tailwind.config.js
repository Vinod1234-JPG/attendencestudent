/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        mrf: {
          navy: '#142D4E',
          'dark-navy': '#0B1B30',
          blue: '#2864B4',
          'light-blue': '#EAF2FC',
          bg: '#F7F9FC',
          card: '#FFFFFF',
          text: '#182230',
          muted: '#667085',
          border: '#E4E9F0',
          success: '#16835D',
          warning: '#B7791F',
          error: '#C0393A',
          badge: '#EEF1F5',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
