/* Swift Courier Services brand tokens and Tailwind theme. */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0B1B2B', 900: '#07131F', 800: '#12293F', 700: '#1B3A56', 600: '#2C506F', 400: '#5B7691' },
        cream: { DEFAULT: '#F7F4EF', 50: '#FFFDF9', 100: '#FDFCFA', 200: '#EFEAE1', 300: '#E2DACD' },
        blue: {
          50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE', 300: '#A5B4FC', 400: '#818CF8',
          500: '#6366F1', 600: '#4F46E5', 700: '#4338CA', 800: '#3730A3', 900: '#312E81',
          DEFAULT: '#4F46E5', dark: '#4338CA', light: '#6366F1', soft: '#818CF8', pale: '#EEF2FF', ghost: '#EEF2FF', sky: '#A5B4FC'
        },
        indigo: { 50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE', 300: '#A5B4FC', 400: '#818CF8', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA', 800: '#3730A3', 900: '#312E81', DEFAULT: '#4F46E5', soft: '#818CF8' },
        moss: { 50: '#F3F4F0', 100: '#E5E7DF', 200: '#CDD1C2', 300: '#B3B9A4', 400: '#969F83', 500: '#7F8C6C', 600: '#6B7A5C', 700: '#566348', DEFAULT: '#6B7A5C' },
        'ultra-pink': { 50: '#FDF2F8', 100: '#FCE7F3', 200: '#FBCFE8', 300: '#F9A8D4', 400: '#F472B6', 500: '#EC4899', 600: '#DB2777', 700: '#BE185D', DEFAULT: '#EC4899' },
        gold: { 50: '#FDF2F8', 100: '#FCE7F3', 200: '#FBCFE8', 300: '#F9A8D4', 400: '#F472B6', 500: '#EC4899', 600: '#DB2777', 700: '#BE185D', DEFAULT: '#EC4899', dark: '#BE185D', light: '#F9A8D4' },
        teal: { DEFAULT: '#6B7A5C', light: '#7F8C6C' },
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