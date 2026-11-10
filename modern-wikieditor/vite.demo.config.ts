import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';

// Separate opt-in demo build; publishing always builds the library instead.
export default defineConfig({
	plugins: [vue()],
	build: {outDir: 'demo-dist', rollupOptions: {input: 'demo.html'}},
});
