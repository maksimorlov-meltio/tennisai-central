import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
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
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      // The whole radius scale maps to the --radius token (0 in the current
      // theme). xl/2xl/3xl are remapped too — without them Tailwind's literal
      // 12/16/24px values leak through wherever a component uses `rounded-xl`,
      // which is how the app ended up with rounded cards next to square ones.
      // `rounded-full` / `rounded-none` are intentionally not overridden, so
      // avatars, pills and badges keep their shape.
      borderRadius: {
        DEFAULT: "var(--radius)",
        "3xl": "var(--radius)",
        "2xl": "var(--radius)",
        xl: "var(--radius)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      /**
       * Named motion tokens — deliberately NOT arbitrary values.
       *
       * `tailwindcss-animate` re-registers the `duration-*`, `delay-*` and
       * `ease-*` utilities, and its registration rejects arbitrary candidates:
       * with the plugin loaded, `duration-[600ms]` and
       * `ease-[cubic-bezier(...)]` generate NO css rule at all — not even the
       * core transition one. The class lands in the DOM, matches nothing, and
       * the element silently falls back to the 150ms default from
       * `transition-*`. Nothing warns: tsc, eslint and the build are all happy.
       * Theme-scale names are matched by both plugins, so they always emit.
       */
      transitionDuration: {
        120: "120ms",
        600: "600ms",
      },
      transitionTimingFunction: {
        /** Matte, editorial ease-out: decisive start, no bounce at the end. */
        editorial: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        /** Scroll/enter reveal: rise + fade. Small distance on purpose — this
         *  brand is matte and editorial, not bouncy. */
        "rise-in": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-soft": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        /** Skeleton placeholder sweep. */
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "rise-in": "rise-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        // Short on purpose. At 0.5s the page sat fully invisible for the first
        // frames of every navigation, which reads as the app being slow rather
        // than as polish. 0.14s is enough to soften the swap and no more.
        "fade-in-soft": "fade-in-soft 0.14s ease-out both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    /**
     * Pointer-capability variants.
     *
     * `coarse:` = `@media (pointer: coarse)` — a finger, a stylus, a TV
     * remote. It is how the primitives below reach the 44x44 minimum tap
     * target on phones and tablets WITHOUT inflating the desktop UI, where a
     * mouse is precise and 40px rows are the right density.
     *
     * Deliberately a plugin variant rather than a `screens: { coarse: { raw }}`
     * entry: a raw screen joins the responsive sort order and would then
     * interleave with sm/md/lg in ways that depend on declaration order.
     *
     * Companion `fine:` for the rare rule that must apply to mice only.
     */
    plugin(({ addVariant }) => {
      addVariant("coarse", "@media (pointer: coarse)");
      addVariant("fine", "@media (pointer: fine)");
    }),
  ],
} satisfies Config;
