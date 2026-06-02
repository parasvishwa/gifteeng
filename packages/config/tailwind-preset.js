/** @type {import('tailwindcss').Config} */
const preset = {
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // Brand — coral-red, matches the logo. Also aliased as `pink` for
        // backward compat so existing `bg-pink` / `text-pink-dark` classes
        // keep working but now point at the new brand color.
        brand: {
          DEFAULT: "hsl(351 85% 58%)",
          dark:    "hsl(351 85% 48%)",
          light:   "hsl(351 85% 96%)",
          tint:    "hsl(351 85% 96%)",
        },
        pink: {
          DEFAULT: "hsl(351 85% 58%)",
          dark:    "hsl(351 85% 48%)",
          light:   "hsl(351 85% 96%)",
        },
        // Gold stays reserved for the Goins / rewards visual language —
        // semantically distinct from brand so the currency keeps identity.
        gold: "hsl(43 96% 52%)",
        charcoal: {
          DEFAULT: "hsl(240 12% 10%)",
          light: "hsl(240 8% 28%)",
        },
      },
      // UI/UX Pro Max design system recommendation:
      //   Rubik     → display/headings (bold, warm, energetic — perfect for gifting)
      //   Nunito Sans → body/UI text (clean, rounded, readable — boosts e-commerce trust)
      // CSS variables are injected by layout.tsx next/font; fallbacks ensure
      // the correct font still loads on any SSR mismatch.
      fontFamily: {
        display: ["var(--font-display)", "Rubik", "system-ui", "sans-serif"],
        body:    ["var(--font-inter)",   "Nunito Sans", "system-ui", "sans-serif"],
        inter:   ["var(--font-inter)",   "Nunito Sans", "system-ui", "sans-serif"],
      },
      // Design system radii — use Tailwind's default scale which maps exactly:
      // rounded-lg=8px(chips), rounded-xl=12px(buttons), rounded-2xl=16px(cards)
      // rounded-3xl=24px, rounded-full=pills, rounded-t-2xl(sheets top)
      // Only override specific named values for semantic clarity:
      borderRadius: {
        card: "1rem",       // 16px cards
        button: "0.75rem",  // 12px buttons/inputs
        chip: "0.5rem",     // 8px chips/tags
        sheet: "1.25rem",   // 20px bottom sheets
      },
    },
  },
  plugins: [],
};

module.exports = preset;
module.exports.default = preset;
