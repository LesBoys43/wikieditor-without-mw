# modern-wikieditor

A modern Vue rewrite of WikiEditor — frontend-only, a drop-in replacement for legacy wikieditor-vue.

An independently publishable TypeScript + Vue SFC library using Wikimedia Codex. No MediaWiki, jQuery, OOUI, parent editor runtime, backend, built-in network requests or storage. GPL-2.0-or-later.

## Compatibility: important intentional exceptions

This package preserves the legacy component's props, text events, textarea access, options and custom-tool editing contract, **with these explicitly chosen breaking exceptions**:

- `getEditor()` remains present but **always throws**, including before mounting. Its return type is `never`. No legacy class instance is exposed.
- `ready()` has **no payload**. Code using `ready(editor)` must migrate to textarea access or custom tool callbacks.
- Vue **^3.5.13** is required by Codex 2.7.0 (legacy supported Vue ^3.3.0).
- Codex markup and visual styling replace the legacy DOM/CSS. Old DOM selectors and parent-package CSS are not compatible.

Therefore this is not an unrestricted, identity-compatible replacement. Change package imports (including CSS); consumers depending on the exceptions above need code changes. Existing imports of parent-package types/catalogs remain their host application's responsibility. This package exports its own structural option/service/tool types, without depending on either legacy package.

## Install and use

```sh
pnpm add modern-wikieditor vue
```

```vue
<script setup lang="ts">
import {ref} from 'vue';
import {WikiEditor} from 'modern-wikieditor';
import type {WikiEditorComponentOptions, WikiEditorExpose} from 'modern-wikieditor';
import 'modern-wikieditor/styles.css';

const text = ref('Hello');
const component = ref<WikiEditorExpose | null>(null);
const options: WikiEditorComponentOptions = {language: 'en'};
</script>

<template>
  <WikiEditor ref="component" v-model="text" :options="options"
    :textarea-attrs="{name: 'content', 'aria-label': 'Article content'}"
    @error="console.error" />
</template>
```

Named `WikiEditor` export; no default export, plugin or global registration required. `modern-wikieditor/min` has the same API in a minified ESM bundle. JavaScript imports do not inject CSS.

### Styles and direction

Load exactly one style entry once per page, before application overrides:

- `modern-wikieditor/styles.css`: Codex LTR base styles + editor styles.
- `modern-wikieditor/styles-rtl.css`: Codex RTL base styles + editor styles.
- `modern-wikieditor/styles-bidi.css`: experimental Codex bidirectional stylesheet + editor styles, for mixed direction/runtime direction switching. This is experimental upstream, not a guarantee of fully verified mixed-direction behavior.

Do not additionally import Codex's base stylesheet if using one of these entries. CSS imports require a bundler that resolves npm imports. No direct design-token dependency is required. Dialogs remain in the editor's document and receive explicit language/direction.

## Props

| Prop | Default | Behavior |
| --- | --- | --- |
| `modelValue` / `v-model` | `''` | Current Wikitext. Host updates do not echo `change` or model events. |
| `options` | `{}` | Editor options excluding `onChange`, `onError`, `onPreferenceChange`; replaced by events. Replacing the object rebuilds; nested edits do not rebuild. Keep its reference stable. |
| `disabled` | `false` | Native textarea disabled state. |
| `readonly` | `false` | Native textarea read-only state. |
| `textareaAttrs` | `{}` | Primitive native attributes, e.g. name/id/rows/required/placeholder/aria-label. Deep reactive updates. |

Reserved textarea attribute prefixes `on`, `innerHTML`, `outerHTML`, `textContent`, `value`, `defaultValue`, `disabled`, `readonly`, `ref`, `key`, `class`, `style` are ignored, case-insensitively. Only string/number/boolean values are accepted; false removes/omits an attribute; true becomes an empty attribute. Unknown component attributes, class/style and undeclared native listeners go to the outer div, not textarea.

Textarea and editor controls are created after mounting; server-side rendering does not create a DOM editor. `getTextarea()` returns null before mounting/after teardown. Native textarea identity survives reinitialization. Parent model synchronization preserves selection offsets; composition defers outward model/change delivery until compositionend. As in legacy, parent updates received during composition are not forcibly applied over composing text. Depending on browser event order, compositionend followed by a final native input can produce repeated `change` notifications; consumers must not assume change-event deduplication.

## Events and exposed methods

Events: `update:modelValue(value: string)`, `change(value: string)`, `ready()` (no payload), `destroy()`, `error(error: Error)`, `preference-change(key, value)`, `focus(event: FocusEvent)`, `blur(event: FocusEvent)`.

Local mutations emit change; host model sync does not. Rebuild emits destroy before the next ready. Callback options are overridden at runtime even for JavaScript callers.

Template-ref API (`WikiEditorExpose`):

- `getEditor(): never`: always throws an explanatory Error; intentional stub.
- `getTextarea(): HTMLTextAreaElement | null`: native form/input/selection access.
- `focus(): void`.
- `reinitialize(): void`: rebuild with current props; no-op before mount. Current model value is authoritative, not an unacknowledged DOM edit. Instance-only tools/panel/preview state reset.

## Options, tools and services

Options retain legacy names and shapes: `language`, `messages`, `fallbackMessages`, `direction`, `siteName`, `fileNamespace`, `userNamespace`, `userTalkNamespace`, `userName`, `signature`, `magicWords`, `allowedProtocols`, `characterGroups`, `services`, `preferences`, `previewDebounce`, `maxTableCells`, `resizable`, `tools`. Types are exported from the main entry.

English messages are bundled. Language alone does not fetch translations: supply `messages` and optional fallback catalogs. Messages are text-only, with positional parameters, SITENAME and limited PLURAL formatting. Existing official catalog objects can be supplied directly. Default character groups are a small local selection, not MediaWiki's full dataset.

Custom tools accept `{id, label, section?, group?, icon?, hotkey?, action(editor)}`. Icons in custom tool definitions are inert text, never HTML. Duplicate IDs replace built-ins. `action` receives this package's structural `EditorHost`, not the old class. Editing methods include value/selection/text encapsulation, link/file/table insertion, find/replace, focus, localized messages, dialog/panel/tool control, preferences and error reporting. The engine is not a public constructor export. Search uses JavaScript regex semantics; wholeWord uses `\b`, not Unicode-aware segmentation. Default table-cell limit is 10000 including headers. Insert commands honor disabled/read-only; programmatic `setValue` remains allowed.

Optional host callbacks (all receive `{signal: AbortSignal, language: string}`):

- `searchTitles(query, context): Promise<TitleSuggestion[]>`
- `checkTitle(title, context): Promise<TitleSuggestion>`
- `uploadFile(file, context): Promise<{title: string}>`
- `renderPreview(wikitext, context): Promise<string>`

Manual titles work without services or suggestion selection. Search/check/upload requests are superseded/aborted on edits/closure/teardown and stale results are ignored even if a host ignores AbortSignal. The host owns network/auth/CSRF/CORS and persistence.

**Preview HTML must already be sanitized by the host.** It is inserted as trusted HTML, without a bundled sanitizer or sandbox. Preview initially disabled; enable via its button. Input immediately invalidates stale requests, then debounces by `previewDebounce` (default 500ms). Preferences are emitted for host persistence; no localStorage/cookies/telemetry.

## Development, demo and npm publication

From this directory (pnpm install may need at least ten minutes on HDDs):

```sh
pnpm install
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run build:demo
npm pack --dry-run
npm publish
```

The demo uses real SFC compilation, no import map/CDN. Choose one of these modes:

- **Static HTTP server:** run `pnpm run build:demo`, then serve this directory and open `demo.html`. This page loads compiled `demo-dist/assets/demo.js` and `demo.css`, never raw TypeScript. Keep `demo-dist` alongside the page. Relative asset URLs support serving the directory under a URL subpath. Do not use `file://`.
- **Vite development:** run `pnpm run dev` and open `/demo/index.html` on the URL printed by Vite. This separate source entry lets Vite compile `.ts` and `.vue` files. Do not serve `demo/index.html` using an ordinary static server.
- **Built standalone demo:** serve `demo-dist` and open `/demo/index.html` within that output directory.

`build:demo` writes only `demo-dist`, not the library `dist`. The npm allowlist excludes demo and source files. The demo demonstrates v-model, lifecycle, disabled/read-only, direction and intentional stub errors. It has no service backend or renderer.

Codex 2.7.0 declares Node >=24.14.1 (and npm >=11.11.0 in its own package metadata); use a supported Node release for development/publication. This package follows that Node floor. The browser library requires Vue ^3.5.13.

Vite builds regular/minified ESM; Vue, Codex and icons remain external. `vue-tsc` emits declarations; styles are explicit opt-in files. `prepack` runs lint/typecheck/build. npm publication includes dist, README, COPYING and NOTICE; there are no workspace/file/link dependencies. No tests are included. Build/typecheck success is not browser interaction or visual verification.

## License

GPL-2.0-or-later; see COPYING and NOTICE.md. Source available in the repository. Codex/icons/Vue retain their respective upstream licenses.
