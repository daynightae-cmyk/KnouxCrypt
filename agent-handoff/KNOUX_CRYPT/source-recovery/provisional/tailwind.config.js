/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        "splash-background": "hsl(var(--splash-background))",
      },
      fontFamily: {
        sans: ["system-ui", "sans-serif"],
        display: ["Montserrat", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "grad-violet-tilted": "linear-gradient(180deg, #0100EF 0%, #BD65EF 100%)",
      },
      container: {
        center: true,
        padding: "2rem",
        screens: { "2xl": "1400px" },
      },
    },
  },
  plugins: [],
};
