# wikieditor-without-mw

A standalone, TypeScript-native Wikitext editing UI derived from MediaWiki WikiEditor. Version 0.1.0 uses native DOM controls and exports the `WikiEditor` class through ESM only. No MediaWiki, ResourceLoader, jQuery, jQuery UI, OOUI, or runtime npm dependencies are required.

## Install and initialize

```sh
pnpm add wikieditor-without-mw
```

```ts
import {WikiEditor} from 'wikieditor-without-mw';
import 'wikieditor-without-mw/styles.css';
import chinese from 'wikieditor-without-mw/i18n/zh-hans.json';

const textarea = document.querySelector<HTMLTextAreaElement>('#content');
if (!textarea) throw new Error('Missing textarea');

const editor = new WikiEditor(textarea, {
    language: 'zh-hans',
    messages: chinese,
    onChange(value) { console.log(value); }
});

editor.insertText('Hello');
// On component unmount:
editor.destroy();
```

The textarea must have a parent node. Its name, value and form participation remain intact. Importing the package does not touch the DOM; instantiate only in a browser, after mounting the textarea. No automatic initialization or global registration occurs. One instance per textarea, multiple instances per page. `destroy()` is idempotent, aborts outstanding services, clears listeners and timers, restores the textarea's original class/style, and retains edited text.

The stylesheet is a separate import; do not expect the JavaScript module to inject it. ESM normal and minified entry points are `wikieditor-without-mw` and `wikieditor-without-mw/min`. No CJS, IIFE, jQuery plugin API, or legacy MediaWiki API is supplied.

## Editing API

- `getValue()`, `setValue(value)`, `focus()`.
- `getSelection()`, `setSelection(start, end?)`, `getSelectedText()` (UTF-16 offsets, like native textarea).
- `insertText(text)`, `encapsulate({pre, post, peri, ownline, splitlines, regex, regexReplace})`.
- `insertLink(target, label?, external?)`.
- `insertFile({title, caption?, alt?, size?, align?, format?})`.
- `insertTable({rows, columns, header?, wikitable?, sortable?, caption?})`.
- `findNext(search, options?)`, `replaceSelection(search, replacement, options?)`, `replaceAll(search, replacement, options?)`.
- `openDialog('link' | 'file' | 'table' | 'replace')`.
- `togglePanel('advanced' | 'characters' | 'help')`.
- `addTool(tool)`, `removeTool(id)`.
- `getPreference(key)`, `setPreference(key, value)`.
- `setPreviewEnabled(boolean)`, `refreshPreview()` (require a renderer).
- `msg(key, ...parameters)`, `destroy()`.

Search options are `{caseSensitive?, regex?, wholeWord?}`. Regex mode uses JavaScript regular expressions and replacement capture syntax. `wholeWord` uses JavaScript `\b` semantics, not a language-aware word segmenter. Invalid/empty searches throw. Large or pathological regular expressions can block the browser; only accept trusted expressions or constrain them in your host UI. API calls after destruction throw except repeated `destroy()`.

Native `input` events are emitted by editor text mutations, and `onChange` also receives user typing. Text insertion respects a disabled/read-only textarea; explicit `setValue` remains available for host-controlled updates. Native `setRangeText` is used; this does not promise browser-native undo-history preservation.

```ts
editor.addTool({
    id: 'citation', label: 'Citation', section: 'advanced', group: 'insert',
    action(instance) { instance.encapsulate({pre: '<ref>', post: '</ref>'}); }
});
```

## Optional host services

No built-in request goes to Wikimedia or any other server. Supply asynchronous callbacks in `options.services`:

```ts
const editor = new WikiEditor(textarea, {
    services: {
        async searchTitles(query, {signal, language}) {
            // Call your own application service. No fixed endpoint or auth scheme is assumed.
            return [{title: query, exists: true, description: language}];
        },
        async checkTitle(title, {signal}) {
            return {title, exists: true};
        },
        async uploadFile(file, {signal}) {
            // Upload using your application's authentication and permission checks.
            return {title: file.name};
        },
        async renderPreview(wikitext, {signal, language}) {
            // Return sanitized, trusted HTML from your renderer.
            return '<p>Sanitized preview</p>';
        }
    },
    previewDebounce: 500,
    onError(error) { console.error(error); }
});
```

The snippets show callback signatures, not implementations of backend behavior. Honor the abort signal to avoid wasted work; the editor also rejects superseded results. Without services, manually entering link and file targets still works, while search/check/upload/preview capabilities are not enabled. The preview toggle appears only with `renderPreview`.

**Security boundary:** the preview HTML callback must sanitize its output before returning it. Preview HTML is inserted into the DOM, not sandboxed. Translation strings, labels and title suggestions are inserted as text, not interpreted as HTML. Authentication, CSRF, CORS, upload validation, URL policy, saved revisions and conflicts belong to the host. This library is not a Wikitext parser, file storage provider, or publishing backend. A syntax insertion is not a promise that a particular wiki supports it.

## Localization and configuration

The original catalogs are shipped verbatim under `i18n/*.json`, including contributor metadata. English is bundled as fallback; other catalogs are explicitly imported and passed via `messages`. Merely setting `language` does not fetch or load a catalog. Set `fallbackMessages` to catalogs in descending priority, if needed. `qqq.json` is translator documentation, not a UI locale.

`direction` accepts `ltr`/`rtl`; a common RTL-language list is used when omitted. Regional/variant fallback beyond English is host-configured. `msg()` supports positional `$1` parameters, `SITENAME`, and common non-nested `PLURAL` blocks using `Intl.PluralRules`. This is not the full MediaWiki message parser; complex grammar/magic-word markup may remain literal. Translation completeness varies by upstream catalog. Help examples are displayed as text rather than parsed Wikitext.

Other options include:

- `siteName`, `fileNamespace`, `userNamespace`, `userTalkNamespace`, `userName`, `signature`.
- `magicWords`: localized `redirect`, `thumbnail`, `left`, `center`, `right`, `none`, `frame`, `frameless`, `alt`.
- `allowedProtocols`: external-link prefixes; default `https:`, `http:`, `mailto:`, `ftp:`, `//`.
- `characterGroups`: custom `{id, label, characters}` groups. Defaults are a small common-character subset, **not** the full MediaWiki core character database.
- `maxTableCells`: default 10000 including optional header cells; `resizable`: default true.
- `preferences`: initial per-instance values; `onPreferenceChange(key, value)` for host persistence. No cookies/localStorage or account API are used internally.
- `tools`: custom toolbar definitions supplied at construction.

The toolbar retains the official feature organization and Wikitext actions with a Wikimedia-inspired style. Native controls and text-symbol icons replace the OOUI widgets/icons. It is not pixel-identical to upstream; old jQuery extension configuration is not supported.

## Development and publication

```sh
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run build
npm pack --dry-run
npm publish
```

Allow at least ten minutes when installing on an HDD. The build uses tsup, emits regular/minified ESM and declarations, and copies the scoped CSS. `prepack` performs type checking and a build. The package allowlist includes adaptation source and translation catalogs, not `official-wikieditor/`, development dependencies, tests or examples. Publishing requires your own npm credentials and access to the package name; publication is not performed by this repository.

ESLint's root `.eslintrc.json` follows the requested `D:\forum` configuration with only two user-authorized additions disabling `es-x` rules; tsup follows the requested `D:\wikitext2html` layout with ESM-only output. No tests or example page are included, as requested.

## License

**GPL-2.0-or-later**, matching the supplied WikiEditor extension. See `COPYING` and `NOTICE.md` for the license, upstream attribution, and adaptation details. The original source directory remains unchanged. This is not an official Wikimedia release.
