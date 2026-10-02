import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        tinta: "#111111",
        crema: "#F0EEE9",
        "crema-header": "#FFF9EC",
        panel: "#F5F5F5",
        borde: "#EAEAEA",
        "gris-texto": "#9CA3AF",
        "gris-medio": "#4B5563",
        dorado: "#FFC94A",
        "dorado-link": "#B8860B",
        error: "#DC2626",
        ingreso: "#1E7A4C",
        "ingreso-fondo": "#CDEBD9",
        "gasto-fondo": "#F7D6D6",
      },
      fontFamily: {
        mono: ["var(--font-fragment-mono)", "monospace"],
      },
      boxShadow: {
        "hard-sm": "2px 2px 0 #111111",
        hard: "3px 3px 0 #111111",
        "hard-md": "4px 4px 0 #111111",
        "hard-lg": "5px 5px 0 #111111",
        "hard-xl": "6px 6px 0 #111111",
        "hard-active": "1px 1px 0 #111111",
      },
      borderRadius: {
        DEFAULT: "0",
        none: "0",
        full: "9999px",
      },
    },
  },
  plugins: [],
};
export default config;
