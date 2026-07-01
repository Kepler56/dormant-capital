// tailwind.config.ts
// Why: the whole visual identity lives here as semantic tokens so components never
// hard-code hex. The palette is a deliberate DUOTONE inspired by modern institutional
// finance SaaS: a confident DEEP BLUE carries identity + health + positive signal (wordmark,
// active nav, score rings, "strong" verdicts), while a brighter INDIGO-BLUE carries ACTION
// (primary buttons, links). Navy ink, soft blue-tinted surfaces, generous radii and a soft,
// layered shadow give the friendly-but-serious feel. `accent` is aliased to the action
// blue so existing components adopt the new CTA colour with no per-file churn.
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16223D", // deep navy — primary text (softer than pure black)
        "ink-soft": "#5A6B85", // secondary text
        muted: "#8A99B0", // tertiary / captions

        // Brand — deep blue: identity, health, positive verdicts, score rings.
        brand: "#1D4ED8",
        "brand-dark": "#1E40AF",
        "brand-soft": "#DBEAFE", // pale blue wash (active nav, success chips)
        forest: "#1E3A8A", // deep navy blue for gradient backplates
        "forest-dark": "#172554",

        // Action — brighter indigo-blue: primary buttons, links, focus rings.
        action: "#3D5AF1",
        "action-dark": "#2B43C9",
        "action-soft": "#E8ECFE",
        // Alias so pre-existing `bg-accent` / `text-accent` adopt the action blue.
        accent: "#3D5AF1",
        "accent-dark": "#2B43C9",
        "accent-soft": "#E8ECFE",

        // Semantic status tones (verdict bands, deltas).
        good: "#1D4ED8",
        "good-soft": "#DBEAFE",
        watch: "#F5A623",
        "watch-soft": "#FDF1DD",
        idle: "#94A3B8",
        "idle-soft": "#EEF1F5",
        bad: "#F2545B",
        "bad-soft": "#FDE8E9",

        // Surfaces
        surface: "#FFFFFF",
        canvas: "#F5F7FB", // page background, faintly blue-tinted off-white
        line: "#E7ECF0", // hairline borders
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        // Soft, layered card shadow — the signature "floating panel" look.
        soft: "0 1px 2px rgba(16,34,61,0.04), 0 6px 20px -8px rgba(16,34,61,0.10)",
        lift: "0 4px 12px rgba(16,34,61,0.06), 0 18px 40px -16px rgba(16,34,61,0.18)",
        ring: "0 10px 30px -12px rgba(30,58,138,0.45)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
