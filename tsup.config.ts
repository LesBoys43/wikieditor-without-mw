import {defineConfig} from 'tsup';

// Follow wikitext2html's normal/minified builds, with ESM-only output.
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
		minify: true,
		outExtension() {
			return {js: '.min.js'};
		},
	},
]);
