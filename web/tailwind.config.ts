import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Greens (primary surfaces, buttons, highlights)
        brandGreen: '#CDEFB8',
        brandGreenDeep: '#A9DE8E',
        brandGreenLight: '#DDF5CC',
        brandMint: '#EEF9E4',
        brandForest: '#1F4D2E', // dark green: Register button, page-transition paint
        brandForestDark: '#163A22',
        // Camel (accent, replaces the old pink)
        brandCamel: '#C19A6B',
        brandCamelDark: '#8B6239', // camel that carries white text
        brandCamelLight: '#F1E4D3',
        brandTeal: '#00A3AD',
        brandTealDark: '#008790',
        brandDark: '#0D0D0D',
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        // Futura where installed (macOS/iOS); Jost (open-source Futura-style) elsewhere.
        sans: ['var(--font-body)'],
        body: ['var(--font-body)'],
        handwriting: ['"Caveat"', 'cursive'],
        heading: ['var(--font-integral)', 'var(--font-body)'],
      },
    },
  },
  plugins: [],
};
export default config;
