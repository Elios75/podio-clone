import type { Config } from "tailwindcss";

// Podio design tokens — see docs/design/podio-design-skill/references/tokens.md
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        podio: {
          teal: "#15808D",
          "teal-dark": "#0F6D79",
          chrome: "#CBDBDB",
          page: "#EDEDED",
          border: "#E3E3E3",
          ink: "#333333",
          secondary: "#6E7A7A",
          meta: "#8A9494",
          disabled: "#B8C2C2",
          orange: "#F7A11C",
          yellow: "#F5D327",
          "row-alt": "#F7F7F7",
          "row-hover": "#ECECEC",
        },
      },
      fontFamily: {
        // Current Progress-era Podio uses the platform's system UI font
        // (Segoe UI on Windows, SF Pro on macOS, Roboto on Android) — no
        // webfont. Same stack here = same rendering as Podio everywhere.
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
