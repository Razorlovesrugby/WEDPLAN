import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1a1a1a",
        paper: "#fbfaf8",
        line: "#e6e2dc",
        muted: "#6b6560",
        accent: "#7c5c3e",
        tierA: "#2f6f4f",
        tierB: "#b07d2b",
        tierC: "#8a8580",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ["ui-serif", "Georgia", "Cambria", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
