/* Swift Courier Service — Tailwind theme config.
   Kept separate from site.js so each page can load it immediately after the
   Tailwind CDN script and before any markup is parsed. */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0B1B2B', 900: '#07131F', 800: '#12293F', 700: '#1B3A56', 600: '#2C506F', 400: '#5B7691' },
        cream: { DEFAULT: '#F7F4EF', 50: '#FFFDF9', 100: '#FDFCFA', 200: '#EFEAE1', 300: '#E2DACD' },
        // The numeric scale was missing, so every bg-blue-500 / text-blue-300 /
        // blue-100 reference in the markup silently rendered as no colour.
        blue: {
          50: '#F1F6FB', 100: '#E2EDF7', 200: '#C5DCEF', 300: '#8FBCE0', 400: '#5A97CB',
          500: '#2B6CA8', 600: '#1C4E80', 700: '#164062', 800: '#12355B', 900: '#0C2540',
          DEFAULT: '#1C4E80', dark: '#12355B', light: '#2B6CA8', soft: '#4A90C4',
          pale: '#E8F1FA', ghost: '#EAF2F9', sky: '#7FB0D8'
        },
        gold: { 50: '#FBF3E4', 100: '#F6E7C7', 200: '#ECD49B', 300: '#DDB66A', 400: '#D0A046', 500: '#C08A2E', 600: '#A06E22', 700: '#7C551A', DEFAULT: '#C08A2E', dark: '#7C551A', light: '#DDB66A' },
        teal: { DEFAULT: '#0E7C6B', light: '#17A78E' },
        dusk: { DEFAULT: '#5A7A8F', light: '#8BA8B8', dark: '#3A5566' }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif']
      },
      boxShadow: {
        soft: '0 1px 2px rgba(11,27,43,.04), 0 12px 32px -12px rgba(11,27,43,.16)',
        lift: '0 2px 4px rgba(11,27,43,.05), 0 28px 56px -20px rgba(11,27,43,.28)'
      }
    }
  }
};