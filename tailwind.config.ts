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
        // Fixed 8-colour palette for cut-line tiers, indexed by tier_position
        // (spec 5, part A, A6 decision 4) — not planner-choosable. cut0-2
        // match the legacy tierA/B/C hues so a wedding with today's two
        // lines looks unchanged; cut3-7 extend it for the 4th-8th line.
        cut0: "#2f6f4f",
        cut1: "#b07d2b",
        cut2: "#8a8580",
        cut3: "#8c3f4f",
        cut4: "#3f5a7c",
        cut5: "#4f7a5c",
        cut6: "#6a4f7c",
        cut7: "#7c5c3e",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ["ui-serif", "Georgia", "Cambria", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
