# wikieditor-vue

Vue 3 + TypeScript adapter for `wikieditor-without-mw`. Independent ESM-only npm package in the same Git repository as the parent. Requires Vue >=3.3 <4. No jQuery or MediaWiki environment.

## Install

```sh
pnpm add wikieditor-vue vue
```

```vue
<script setup lang="ts">
import {ref} from 'vue';
import {WikiEditor} from 'wikieditor-vue';
import type {WikiEditorExpose, WikiEditorComponentOptions} from 'wikieditor-vue';
import 'wikieditor-vue/styles.css';

const text = ref('Hello');
const component = ref<WikiEditorExpose | null>(null);
const options: WikiEditorComponentOptions = {language: 'en'};
</script>

<template>
  <WikiEditor
    ref="component"
    v-model="text"
    :options="options"
    :textarea-attrs="{name: 'content', placeholder: 'Wikitext', 'aria-label': 'Content'}"
    @error="console.error"
  />
</template>
```

Import the stylesheet explicitly using a bundler that resolves npm CSS imports and relative SVG URLs. Alternatively import `wikieditor-without-mw/styles.css` directly. JavaScript imports do not inject styles. `wikieditor-vue/min` provides minified ESM with the same API.

## Props

| Prop | Default | Meaning |
| --- | --- | --- |
| `modelValue` / `v-model` | `''` | Text. Parent updates do not emit change events back. |
| `options` | `{}` | Parent editor options, except callbacks replaced by component events. Replace this object to rebuild; nested changes do not rebuild. Keep its reference stable during normal renders. |
| `disabled` | `false` | Native textarea disabled state. |
| `readonly` | `false` | Native textarea read-only state. |
| `textareaAttrs` | `{}` | Primitive native attributes such as id, name, rows, required, placeholder, aria-label. Reactive updates supported. Event handlers, HTML/content, value, disabled/readonly, class and style are reserved/ignored. |

Unrecognized component attributes (including class/style and native listeners) are forwarded to the outer div, **not** the textarea. Use `textareaAttrs` for form attributes. The wrapper div always exists; the textarea/editor are created only after mounting, so module import and server-side rendering do not access browser DOM. The wrapper has no children owned by Vue; the editor can reparent the textarea safely.

## Events

- `update:modelValue(value: string)` — user/editor text change; composition changes are deferred until composition ends.
- `change(value: string)` — local text mutation, not host model synchronization.
- `ready(editor)` — constructed instance, including after options replacement/reinitialize.
- `destroy()` — instance released on rebuild or component unmount.
- `error(error: Error)` — editor/service/initialization error.
- `preference-change(key, value)` — host-controlled preference persistence.
- `focus(event)` / `blur(event)` — native textarea focus events (dialogs also move focus).

`options.onChange`, `onError`, `onPreferenceChange` are intentionally excluded from the options type and overridden at runtime by these events. For translations, tools, title search/upload and sanitized preview callbacks use the parent's options API. This adapter adds no network requests or persistence.

## Exposed methods

Use a template ref typed `WikiEditorExpose`:

- `getEditor(): WikiEditor | null` — underlying class instance, null before mounting/after teardown or failed initialization.
- `getTextarea(): HTMLTextAreaElement | null`.
- `focus(): void`.
- `reinitialize(): void` — destroy and rebuild using current props.

Use `getEditor()` for insertion, selection, dialogs and preview methods. Do not call its destroy method directly; let the component own lifecycle, or call reinitialize. Options rebuild retains current model text but resets instance-only state; persist preferences through the corresponding event. No automatic Vue plugin/global registration is needed.

## Development / publication

Run inside this directory:

```sh
pnpm install
pnpm run lint
pnpm run typecheck
pnpm run build
npm pack --dry-run
npm publish
```

Allow at least ten minutes for installation on HDDs. The declared dependency is `wikieditor-without-mw@^0.1.0` **from npm**, not a workspace/file/link dependency. No fallback to local source is performed. Vue and the parent editor stay external to both JS bundles; declarations reference their public types. ESLint is copied from the parent; tsup follows its regular/minified ESM configuration. No tests are included or run.

## License

GPL-2.0-or-later. See COPYING and NOTICE.md.
