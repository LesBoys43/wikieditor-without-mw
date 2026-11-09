import {defineConfig} from 'tsup';

// Match the parent package's ESM builds; neither Vue nor the editor is bundled.
export default defineConfig([
	{
		entry: ['src/index.ts'],
		target: 'es2017',
		outDir: 'dist',
		clean: true,
		dts: true,
		format: ['esm'],
		sourcemap: false,
		splitting: false,
		treeshake: false,
		external: ['vue', 'wikieditor-without-mw'],
	},
	{
		entry: ['src/index.ts'],
		target: 'es2017',
		outDir: 'dist',
		clean: false,
		dts: false,
		format: ['esm'],
		sourcemap: false,
		splitting: false,
		treeshake: false,
		external: ['vue', 'wikieditor-without-mw'],
		minify: true,
		outExtension() {
			return {js: '.min.js'};
		},
	},
]);
