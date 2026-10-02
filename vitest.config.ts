import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // tsconfig usa jsx "preserve" (lo transforma Next); acá hay que transformarlo
  // para poder renderizar componentes en las pruebas.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // Las pruebas de componentes declaran `// @vitest-environment jsdom`.
    testTimeout: 15000,
  },
})
