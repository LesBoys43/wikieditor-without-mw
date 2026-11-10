import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';

// Separate opt-in demo build; publishing always builds the library instead.
export default defineConfig({
	base: './',
	plugins: [vue()],
	server: {open: '/demo/index.html'},
	build: {
		outDir: 'demo-dist',
		rollupOptions: {
			input: 'demo/index.html',
			output: {
				// Stable entry names let the root static demo load compiled assets only.
				entryFileNames: 'assets/demo.js',
				assetFileNames: (asset) => asset.names.some((name) => name.endsWith('.css')) ?
					'assets/demo.css' : 'assets/[name]-[hash][extname]',
			},
		},
	},
});
