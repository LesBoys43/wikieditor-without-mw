<script setup lang="ts">
import {ref} from 'vue';
import {CdxButton, CdxCheckbox} from '@wikimedia/codex';
import {WikiEditor} from '../src';
import type {WikiEditorComponentOptions, WikiEditorExpose} from '../src';

const text = ref("== Modern WikiEditor ==\nSelect some text, then try the toolbar.\n");
const instance = ref<WikiEditorExpose | null>(null);
const mounted = ref(true);
const disabled = ref(false);
const readonly = ref(false);
const events = ref<string[]>([]);
const options = ref<WikiEditorComponentOptions>({language: 'en'});
function log(message: string): void {
	events.value = [message, ...events.value].slice(0, 15);
}
function direction(): void {
	options.value = {language: options.value.language === 'en' ? 'ar' : 'en'};
}
function stub(): void {
	try { instance.value?.getEditor(); } catch (error) { log(String(error)); }
}
</script>

<template>
	<main class="demo">
		<h1>Modern WikiEditor</h1>
		<p>Codex Vue SFC · no MediaWiki, renderer, network or storage</p>
		<div class="demo__controls">
			<cdx-button @click="mounted = !mounted">Mount / unmount</cdx-button>
			<cdx-button @click="instance?.reinitialize()">Reinitialize</cdx-button>
			<cdx-button @click="instance?.focus()">Focus</cdx-button>
			<cdx-button @click="direction">Switch direction</cdx-button>
			<cdx-button @click="stub">Check getEditor stub</cdx-button>
			<cdx-checkbox v-model="disabled">Disabled</cdx-checkbox>
			<cdx-checkbox v-model="readonly">Read-only</cdx-checkbox>
		</div>
		<wiki-editor v-if="mounted" ref="instance" v-model="text" :options="options"
			:disabled="disabled" :readonly="readonly" :textarea-attrs="{name: 'content', 'aria-label': 'Article content'}"
			@ready="log('ready (no payload)')" @destroy="log('destroy')" @error="log($event.message)"
			@change="log('change')" @preference-change="(key, value) => log(`${key}: ${value}`)" />
		<h2>Host model</h2>
		<label>Editing here updates the editor without echoing change events
			<textarea v-model="text" rows="8" class="demo__model"></textarea>
		</label>
		<h2>Events</h2>
		<ul><li v-for="(event, index) in events" :key="index">{{ event }}</li></ul>
	</main>
</template>

<style>
body { margin: 0; background: #f8f9fa; color: #202122; font-family: sans-serif; }
.demo { max-width: 1100px; margin: 0 auto; padding: 24px; }
.demo__controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-block: 16px; }
.demo__model { display: block; box-sizing: border-box; width: 100%; margin-block-start: 8px; padding: 12px; }
</style>
