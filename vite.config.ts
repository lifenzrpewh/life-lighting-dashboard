import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Renderer only. Main and preload are built by `tsc -p tsconfig.main.json` —
// see the note in package.json. Electron-vite would normally cover both, but it
// peers vite ^5/^6/^7 while @vitejs/plugin-react@6 requires ^8, and pinning vite
// a major behind to satisfy a wrapper costs more than the wrapper saves.
export default defineConfig({
	root: 'src/renderer',
	// Relative, because a packaged build loads index.html off disk via file://,
	// where absolute asset paths resolve against the filesystem root and 404.
	base: './',
	plugins: [react(), tailwindcss()],
	build: {
		outDir: path.resolve(import.meta.dirname, 'dist/renderer'),
		emptyOutDir: true,
	},
	server: { port: 5173, strictPort: true },
})
