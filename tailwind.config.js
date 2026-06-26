/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        azdah: {
          bg: '#0D0B08',
          surface: '#1A1410',
          card: '#211A13',
          orange: '#F83433',
          'orange-light': '#FF5049',
          'orange-dark': '#D8281F',
          cream: '#F5F0E8',
          muted: '#8A7A6A',
          border: '#2A2118',
        },
      },
      fontFamily: {
        heading: ['Georgia', 'Bodoni Moda', 'serif'],
        body: ['-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
