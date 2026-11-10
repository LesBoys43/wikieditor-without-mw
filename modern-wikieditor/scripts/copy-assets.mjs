import {copyFile, mkdir, writeFile} from 'node:fs/promises';

await mkdir(new URL('../dist/', import.meta.url), {recursive: true});
await copyFile(new URL('../src/styles.css', import.meta.url), new URL('../dist/editor.css', import.meta.url));
// Direction-specific entry points load Codex exactly once before editor overrides.
for (const [name, codex] of [
	['styles.css', 'codex.style.css'],
	['styles-rtl.css', 'codex.style-rtl.css'],
	['styles-bidi.css', 'codex.style-bidi.css'],
]) {
	await writeFile(new URL(`../dist/${name}`, import.meta.url),
		`@import '@wikimedia/codex/dist/${codex}';\n@import './ui.css';\n@import './editor.css';\n`);
}
