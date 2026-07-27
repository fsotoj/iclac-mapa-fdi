/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // Highlight color for hover across the app. Two shades because contrast
        // depends on what sits underneath:
        //   brand      on a light control  -> pair with text-gray-900 (5.8:1)
        //   brand-dark on an active/dark control -> keeps text-white (5.4:1)
        // White text on `brand` is only 2.96:1, below AA for the small type used in
        // the filter panel, so it must not be used that way.
        brand: {
          DEFAULT: '#00A89C',
          dark: '#00776E'
        }
      }
    }
  },
  plugins: []
}
