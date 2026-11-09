import {copyFile, cp, mkdir} from 'node:fs/promises';

// Keep the stylesheet separate so importing the class is safe outside a browser.
await mkdir(new URL('../dist/', import.meta.url), {recursive: true});
await copyFile(new URL('../src/styles.css', import.meta.url), new URL('../dist/styles.css', import.meta.url));
await copyFile(new URL('../src/icons.css', import.meta.url), new URL('../dist/icons.css', import.meta.url));
// Copy opaque SVG assets verbatim; do not parse, optimize, or rewrite them.
await cp(new URL('../src/icons/', import.meta.url), new URL('../dist/icons/', import.meta.url), {recursive: true});
