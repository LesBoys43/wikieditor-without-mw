import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';

// Run twice to preserve the existing normal/minified ESM entry points.
export default defineConfig(({mode}) => {
	const minified = mode === 'min';
	return {
		plugins: [vue()],
		build: {
			target: 'es2017',
			outDir: 'dist',
			emptyOutDir: !minified,
			sourcemap: false,
			minify: minified ? 'esbuild' : false,
			lib: {
				entry: 'src/index.ts',
				formats: ['es'],
				fileName: () => minified ? 'index.min.js' : 'index.js',
			},
			rollupOptions: {
				external: ['vue', 'wikieditor-without-mw'],
			},
		},
	};
});
