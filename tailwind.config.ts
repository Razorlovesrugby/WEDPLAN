import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The five themeable tokens. They read CSS custom properties so the
        // public site can restyle its whole subtree from the database (spec 14
        // §5) without the planner app changing colour: `globals.css` defines
        // the defaults on :root, and only the site's root element overrides
        // them. Channels rather than hex so `/40`, `/60`, `/85` still work.
        ink: "rgb(var(--site-ink) / <alpha-value>)",
        paper: "rgb(var(--site-paper) / <alpha-value>)",
        line: "rgb(var(--site-line) / <alpha-value>)",
        muted: "rgb(var(--site-muted) / <alpha-value>)",
        accent: "rgb(var(--site-accent) / <alpha-value>)",
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
        // The public site's faces (spec 14 §5). Loaded by src/lib/fonts and
        // exposed as variables on the site's root element, so these resolve to
        // the fallback stack anywhere else — the planner app never loads them.
        script: ["var(--font-script)", "Snell Roundhand", "Apple Chancery", "cursive"],
        body: ["var(--font-body)", "Georgia", "Cambria", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
