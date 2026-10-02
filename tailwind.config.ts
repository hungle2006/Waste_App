import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { boxShadow: { soft: "0 18px 55px rgba(15,23,42,.10)" } } },
  plugins: [],
};
export default config;
