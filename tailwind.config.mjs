/**
 * Paleta y tokens estilo Linear / Notion / Things 3.
 * Tailwind v4 lo carga vía `@config` desde src/styles/global.css.
 *
 * Las sombras neumórficas usan var(--sombra-clara) / var(--sombra-oscura),
 * que cambian de valor en .dark — así una sola clase sirve para ambos temas.
 */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['Literata', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        // Grises fríos (superficies y texto)
        base: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#e2e5ec',
          300: '#cdd2dc',
          400: '#9aa2b1',
          500: '#6b7484',
          600: '#4a5261',
          700: '#343b48',
          800: '#232935',
          900: '#171b24',
          950: '#0f1218',
        },
        // Acento índigo suave
        acento: {
          300: '#a5b4fc',
          400: '#8b9bf7',
          500: '#6d7ff0',
          600: '#5563d8',
        },
      },
      boxShadow: {
        neu: '6px 6px 14px var(--sombra-oscura), -6px -6px 14px var(--sombra-clara)',
        'neu-sm': '3px 3px 8px var(--sombra-oscura), -3px -3px 8px var(--sombra-clara)',
        'neu-inset':
          'inset 3px 3px 7px var(--sombra-oscura), inset -3px -3px 7px var(--sombra-clara)',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
      transitionTimingFunction: { suave: 'cubic-bezier(0.65, 0, 0.35, 1)' },
    },
  },
};
