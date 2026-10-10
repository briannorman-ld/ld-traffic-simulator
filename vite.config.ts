import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs so the build works at any path, e.g. GitHub Pages' /<repo>/.
  base: './',
  plugins: [react()],
})
