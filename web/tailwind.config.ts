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
        brandYellow: '#FCD44D',
        brandYellowLight: '#FBE88C',
        brandYellowWarm: '#F8C42E',
        brandCream: '#FFF2AD',
        brandOrange: '#FF9129',
        brandPink: '#E82B8A',
        brandTeal: '#00A3AD',
        brandTealDark: '#008790',
        brandDark: '#0D0D0D',
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'var(--font-geist-sans)', 'sans-serif'],
        handwriting: ['"Caveat"', 'cursive'],
      },
    },
  },
  plugins: [],
};
export default config;
