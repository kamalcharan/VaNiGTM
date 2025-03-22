# 1. Update tailwind.config.js - make sure content paths are correct
cat > tailwind.config.js << EOL
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        gray: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        }
      },
      container: {
        center: true,
        padding: '1rem',
      },
    },
  },
  plugins: [],
}
EOL

# 2. Create postcss.config.js if it doesn't exist
cat > postcss.config.js << EOL
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOL

# 3. Make sure index.css is imported in main.tsx
grep -q "import './index.css'" src/main.tsx || echo "// Check if index.css is imported in main.tsx"

# 4. Restart the development server
echo "# Restart your dev server with: npm run dev"