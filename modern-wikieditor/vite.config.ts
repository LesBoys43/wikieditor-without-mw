import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';

// Both entry points use the same SFC source and keep host libraries external.
export default defineConfig(({mode}) => ({
	plugins: [vue()],
	build: {
		target: 'es2017',
		outDir: 'dist',
		emptyOutDir: mode !== 'min',
		minify: mode === 'min' ? 'esbuild' : false,
		lib: {
			entry: 'src/index.ts',
			cssFileName: 'ui',
			formats: ['es'],
			fileName: () => mode === 'min' ? 'index.min.js' : 'index.js',
		},
		rollupOptions: {external: ['vue', '@wikimedia/codex', '@wikimedia/codex-icons']},
	},
}));
