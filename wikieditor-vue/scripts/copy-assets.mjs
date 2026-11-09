import {copyFile, mkdir} from 'node:fs/promises';

// Preserve the stylesheet as an opt-in export, just like the parent package.
await mkdir(new URL('../dist/', import.meta.url), {recursive: true});
await copyFile(new URL('../src/styles.css', import.meta.url), new URL('../dist/styles.css', import.meta.url));
