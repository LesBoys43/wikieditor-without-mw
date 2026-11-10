<template>
	<cdx-dialog
		v-model:open="open"
		class="modern-wikieditor-dialog"
		:title="title"
		:use-close-button="true"
		:close-button-label="closeLabel"
		:render-in-place="true"
		:dir="direction"
		:lang="language"
	>
		<form
			ref="form"
			class="modern-wikieditor-dialog__form"
			novalidate
			@submit.prevent="submit"
			@keydown.capture="onKeydownCapture"
			@keydown="onKeydown">
			<template v-if="name === 'link' || name === 'file'">
				<cdx-field v-if="name === 'link'">
					<template #label>
						{{ msg( 'wikieditor-toolbar-tool-link' ) }}
					</template>
					<cdx-select
						v-model:selected="mode"
						class="modern-wikieditor-dialog__select"
						:menu-items="linkModes"
						:menu-config="menuConfig" />
				</cdx-field>
				<cdx-field data-dialog-field="target" :status="fieldStatus( 'target' )">
					<template #label>
						{{ titleLabel }}
					</template>
					<cdx-lookup
						v-if="titleServicesEnabled"
						v-model:selected="selectedTitle"
						v-model:input-value="target"
						:menu-items="menuItems"
						:menu-config="menuConfig"
						:title="targetTooltip"
						@input="onTitleInput"
						@change="checkTitle"
						@blur="checkTitle"
					/>
					<cdx-text-input
						v-else
						v-model="target"
						@update:model-value="onTitleInput" />
				</cdx-field>
				<cdx-field v-if="name === 'link'" :optional="true">
					<template #label>
						{{ msg( `${linkPrefix}-text` ) }}
					</template>
					<cdx-text-input
						v-model="label"
						:title="msg( 'wikieditor-toolbar-tool-link-int-text-tooltip' )" />
				</cdx-field>
			</template>
			<template v-if="name === 'file'">
				<cdx-field :optional="true">
					<template #label>
						{{ msg( 'wikieditor-toolbar-file-caption' ) }}
					</template>
					<cdx-text-input v-model="caption" />
				</cdx-field>
				<cdx-field :optional="true">
					<template #label>
						{{ msg( 'wikieditor-toolbar-file-alt' ) }}
					</template>
					<template #description>
						{{ msg( 'wikieditor-toolbar-file-alt-help' ) }}
					</template>
					<cdx-text-input v-model="alt" />
				</cdx-field>
				<cdx-field
					data-dialog-field="size"
					:optional="true"
					:status="fieldStatus( 'size' )">
					<template #label>
						{{ msg( 'wikieditor-toolbar-file-size' ) }}
					</template>
					<cdx-text-input
						v-model="size"
						input-type="number"
						min="1"
						step="1"
						@input="clearError" />
				</cdx-field>
				<cdx-field>
					<template #label>
						{{ msg( 'wikieditor-toolbar-file-float' ) }}
					</template>
					<cdx-select
						v-model:selected="align"
						class="modern-wikieditor-dialog__select"
						:menu-items="alignItems"
						:menu-config="menuConfig" />
				</cdx-field>
				<cdx-field>
					<template #label>
						{{ msg( 'wikieditor-toolbar-file-format' ) }}
					</template>
					<cdx-select
						v-model:selected="format"
						class="modern-wikieditor-dialog__select"
						:menu-items="formatItems"
						:menu-config="menuConfig" />
				</cdx-field>
				<cdx-field
					v-if="services?.uploadFile"
					data-dialog-field="picker"
					:optional="true"
					:status="fieldStatus( 'picker' )">
					<template #label>
						{{ msg( 'wikieditor-toolbar-tool-file-upload' ) }}
					</template>
					<input
						ref="picker"
						type="file"
						:aria-label="msg( 'wikieditor-toolbar-tool-file-upload' )"
						@change="onPickerChange">
					<cdx-button
						type="button"
						:aria-busy="uploading"
						@click="upload">
						{{ msg( 'wikieditor-toolbar-tool-file-upload' ) }}
					</cdx-button>
				</cdx-field>
			</template>
			<template v-if="name === 'table'">
				<cdx-field data-dialog-field="rows" :status="fieldStatus( 'rows' )">
					<template #label>
						{{ msg( 'wikieditor-toolbar-tool-table-dimensions-rows' ) }}
					</template>
					<cdx-text-input
						v-model="rows"
						input-type="number"
						min="1"
						step="1"
						@input="clearError" />
				</cdx-field>
				<cdx-field data-dialog-field="columns" :status="fieldStatus( 'columns' )">
					<template #label>
						{{ msg( 'wikieditor-toolbar-tool-table-dimensions-columns' ) }}
					</template>
					<cdx-text-input
						v-model="columns"
						input-type="number"
						min="1"
						step="1"
						@input="clearError" />
				</cdx-field>
				<cdx-field :is-fieldset="true">
					<template #label>
						{{ msg( 'wikieditor-toolbar-tool-table' ) }}
					</template>
					<cdx-checkbox v-model="header">
						{{ msg( 'wikieditor-toolbar-tool-table-dimensions-header' ) }}
					</cdx-checkbox>
					<cdx-checkbox v-model="wikitable">
						{{ msg( 'wikieditor-toolbar-tool-table-wikitable' ) }}
					</cdx-checkbox>
					<cdx-checkbox v-model="sortable">
						{{ msg( 'wikieditor-toolbar-tool-table-sortable' ) }}
					</cdx-checkbox>
				</cdx-field>
				<cdx-field :optional="true">
					<template #label>
						{{ msg( 'wikieditor-toolbar-file-caption' ) }}
					</template>
					<cdx-text-input v-model="caption" />
				</cdx-field>
			</template>
			<template v-if="name === 'replace'">
				<cdx-field data-dialog-field="search" :status="fieldStatus( 'search' )">
					<template #label>
						{{ msg( 'wikieditor-toolbar-tool-replace-search' ) }}
					</template>
					<cdx-text-input v-model="search" @input="clearError" />
				</cdx-field>
				<cdx-field :optional="true">
					<template #label>
						{{ msg( 'wikieditor-toolbar-tool-replace-replace' ) }}
					</template>
					<cdx-text-input v-model="replacement" />
				</cdx-field>
				<cdx-field :is-fieldset="true">
					<template #label>
						{{ msg( 'wikieditor-toolbar-tool-replace' ) }}
					</template>
					<cdx-checkbox v-model="caseSensitive">
						{{ msg( 'wikieditor-toolbar-tool-replace-case' ) }}
					</cdx-checkbox>
					<cdx-checkbox v-model="regex">
						{{ msg( 'wikieditor-toolbar-tool-replace-regex' ) }}
					</cdx-checkbox>
					<cdx-checkbox v-model="wholeWord">
						{{ msg( 'wikieditor-toolbar-tool-replace-word' ) }}
					</cdx-checkbox>
				</cdx-field>
			</template>
			<p
				v-if="error"
				class="modern-wikieditor-dialog__status"
				role="alert">
				{{ error }}
			</p>
			<p
				class="modern-wikieditor-dialog__status"
				role="status"
				aria-live="polite">
				{{ status }}
			</p>
			<div class="modern-wikieditor-dialog__actions">
				<template v-if="name === 'replace'">
					<cdx-button
						type="submit"
						action="progressive"
						weight="primary">
						{{ msg( 'wikieditor-toolbar-tool-replace-button-findnext' ) }}
					</cdx-button>
					<cdx-button type="button" @click="guard( () => runReplace( 'replace' ) )">
						{{ msg( 'wikieditor-toolbar-tool-replace-button-replace' ) }}
					</cdx-button>
					<cdx-button type="button" @click="guard( () => runReplace( 'all' ) )">
						{{ msg( 'wikieditor-toolbar-tool-replace-button-replaceall' ) }}
					</cdx-button>
					<cdx-button type="button" @click="close">
						{{ closeLabel }}
					</cdx-button>
				</template>
				<template v-else>
					<cdx-button type="button" @click="close">
						{{ cancelLabel }}
					</cdx-button>
					<cdx-button
						type="submit"
						action="progressive"
						weight="primary">
						{{ insertLabel }}
					</cdx-button>
				</template>
			</div>
		</form>
	</cdx-dialog>
</template>

<script setup lang="ts">
/** Standalone Codex dialogs. SPDX-License-Identifier: GPL-2.0-or-later */
import {computed, nextTick, onBeforeUnmount, onUnmounted, ref, watch} from 'vue';
import {CdxButton, CdxCheckbox, CdxDialog, CdxField, CdxLookup, CdxSelect, CdxTextInput} from '@wikimedia/codex';
import type {MenuConfig, MenuItemData} from '@wikimedia/codex';
import type {DialogName, EditorHost, FileInsertOptions, ServiceContext} from './types';

const props = withDefaults(defineProps<{
	host: EditorHost;
	name: DialogName;
	restoreOnDispose?:() => boolean;
}>(), {restoreOnDispose: () => true});
const emit = defineEmits<{close: []}>();
const host = props.host;
const textarea = host.textarea;
const ownerDocument = textarea.ownerDocument;
const previousFocus = ownerDocument.activeElement as HTMLElement | null;
const language = host.language;
const direction = host.direction;
const open = ref(true);
let active = true;
let closed = false;
const requests = new Map<string, AbortController>();

// Keep a native snapshot: the parent may destroy its engine before child teardown.
let selection = {
	start: textarea.selectionStart,
	end: textarea.selectionEnd,
	direction: textarea.selectionDirection,
	scrollTop: textarea.scrollTop,
	scrollLeft: textarea.scrollLeft
};
const selectedText = textarea.value.slice(selection.start, selection.end);
const form = ref<HTMLFormElement>();
const picker = ref<HTMLInputElement>();
const error = ref('');
const errorField = ref('');
const status = ref('');
const mode = ref<string | number | null>('internal');
const target = ref<string | number>('');
const selectedTitle = ref<string | number | null>(null);
const menuItems = ref<MenuItemData[]>([]);
const menuConfig: MenuConfig = {visibleItemLimit: 6, renderInPlace: true};
const label = ref<string | number>(props.name === 'link' ? selectedText : '');
const caption = ref<string | number>(props.name === 'file' ? selectedText : '');
const alt = ref<string | number>('');
const size = ref<string | number>('');
const align = ref<string | number | null>('');
const format = ref<string | number | null>('thumbnail');
const rows = ref<string | number>('3');
const columns = ref<string | number>('3');
const header = ref(true);
const wikitable = ref(true);
const sortable = ref(false);
const search = ref<string | number>(props.name === 'replace' ? selectedText : '');
const replacement = ref<string | number>('');
const caseSensitive = ref(false);
const regex = ref(false);
const wholeWord = ref(false);
const uploading = ref(false);
const services = host.options.services;
const titleServicesEnabled = computed(() => props.name === 'file' || mode.value === 'internal');
const linkPrefix = computed(() => `wikieditor-toolbar-tool-link-${mode.value === 'external' ? 'ext' : 'int'}`);
const titleLabel = computed(() => props.name === 'file' ? msg('wikieditor-toolbar-file-target') : msg(`${linkPrefix.value}-target`));
const targetTooltip = props.name === 'link' ?
	msg('wikieditor-toolbar-tool-link-int-target-tooltip') : undefined;
const title = msg(`wikieditor-toolbar-tool-${props.name}-title`);
const closeLabel = msg('wikieditor-toolbar-tool-replace-close');
const insertLabel = msg(props.name === 'link' ? 'wikieditor-toolbar-tool-link-insert' : `wikieditor-toolbar-tool-${props.name}-insert`);
const cancelLabel = msg(`wikieditor-toolbar-tool-${props.name === 'replace' ? 'link' : props.name}-cancel`);
const linkModes: MenuItemData[] = [{value: 'internal', label: msg('wikieditor-toolbar-tool-link-int')}, {value: 'external', label: msg('wikieditor-toolbar-tool-link-ext')}];
const alignItems: MenuItemData[] = [
	{value: '', label: msg('wikieditor-toolbar-file-default')},
	{value: 'left', label: host.magicWords.left},
	{value: 'center', label: host.magicWords.center},
	{value: 'right', label: host.magicWords.right},
	{value: 'none', label: host.magicWords.none}
];
const formatItems: MenuItemData[] = [
	{value: 'thumbnail', label: host.magicWords.thumbnail},
	{value: 'frame', label: host.magicWords.frame},
	{value: 'frameless', label: host.magicWords.frameless},
	{value: 'none', label: msg('wikieditor-toolbar-file-format-none')}
];

/**
 * New standalone messages remain overridable without requiring new catalog entries.
 *
 * @param {string} key Message key.
 * @param {...(string|number)} params Message parameters.
 * @return {string} Localized text.
 */
function msg(key: string, ...params: (string | number)[]): string {
	return host.msg(key, ...params);
}

function fallback(key: string, text: string): string {
	const translated = msg(key);
	return translated === key ? text : translated;
}

function rememberSelection(): void {
	selection = {
		start: textarea.selectionStart,
		end: textarea.selectionEnd,
		direction: textarea.selectionDirection,
		scrollTop: textarea.scrollTop,
		scrollLeft: textarea.scrollLeft
	};
}

function restoreSelection(): void {
	textarea.setSelectionRange(selection.start, selection.end, selection.direction);
	textarea.scrollTop = selection.scrollTop;
	textarea.scrollLeft = selection.scrollLeft;
}

function restoreFocus(): void {
	restoreSelection();
	// Never use host.focus/setSelection here: the host may already be destroyed.
	if (previousFocus?.isConnected && typeof previousFocus.focus === 'function')
		previousFocus.focus({preventScroll: true});
	else if (textarea.isConnected)
		textarea.focus({preventScroll: true});
	restoreSelection();
}

function cancelRequest(key: string): void {
	requests.get(key)?.abort();
	requests.delete(key);
	if (key === 'upload') uploading.value = false;
}

function stopRequests(): void {
	active = false;
	for (const controller of requests.values()) controller.abort();
	requests.clear();
}

function close(): void {
	if (closed) return;
	closed = true;
	stopRequests();
	open.value = false;
	restoreFocus();
	emit('close');
}

watch(open, (value) => {
	if (!value) close();
}, {flush: 'sync'});
onBeforeUnmount(() => {
	stopRequests();
	if (props.restoreOnDispose()) restoreFocus();
});
// Codex restores its saved focus in its child unmount hook; restore ours last.
onUnmounted(() => {
	if (props.restoreOnDispose()) restoreFocus();
});

function clearError(): void {
	error.value = '';
	errorField.value = '';
}

function invalid(message: string, field = ''): void {
	error.value = message;
	errorField.value = field;
	if (field)
		nextTick(() => {
			if (!active) return;
			form.value?.querySelector<HTMLElement>(`[data-dialog-field="${field}"] input`)?.focus();
		});
}

function fail(reason: unknown): void {
	invalid(reason instanceof Error ? reason.message : String(reason));
	host.reportError(reason);
}

function guard(action: () => void): void {
	if (!active) return;
	clearError();
	try {
		action();
	} catch (reason: unknown) {
		if (active) fail(reason);
	}
}

// Derive the callback signature from a standard generic collection API.
type DialogResult<T> = Parameters<Array<T>['forEach']>[0];

function beginRequest(key: string): ServiceContext {
	cancelRequest(key);
	const controller = new AbortController();
	requests.set(key, controller);
	return {signal: controller.signal, language};
}

/**
 * Ignore obsolete successes AND failures, even when a service ignores AbortSignal.
 *
 * @param {string} key Request channel.
 * @param {Function} service Host service invocation.
 * @param {Function} apply Apply a current result.
 */
async function request<T>(
	key: string,
	service: () => Promise<T>,
	apply: DialogResult<T>
): Promise<void> {
	const controller = requests.get(key);
	if (!active || !controller) return;
	if (key === 'upload') uploading.value = true;
	const current = (): boolean => active && !controller.signal.aborted &&
		requests.get(key) === controller;
	try {
		const result = await service();
		if (current()) [result].forEach(apply);
	} catch (reason: unknown) {
		if (current()) {
			if (key === 'search') menuItems.value = [];
			fail(reason);
		}
	} finally {
		if (requests.get(key) === controller) {
			requests.delete(key);
			if (key === 'upload') uploading.value = false;
		}
	}
}

/**
 * Lookup input carries a VALUE, unlike TextInput's native input event.
 *
 * @param {string|number} value Current title text.
 */
function onTitleInput(value: string | number): void {
	if (!active) return;
	target.value = value;
	cancelRequest('upload');
	cancelRequest('search');
	cancelRequest('check');
	clearError();
	status.value = '';
	// A fresh array resolves Codex's pending state on every path, including no service.
	menuItems.value = [];
	const query = String(value).trim();
	const service = services?.searchTitles;
	if (!query || !titleServicesEnabled.value || !service) return;
	const context = beginRequest('search');
	request('search', () => service(query, context), (suggestions) => {
		const seen = new Set<string>();
		menuItems.value = suggestions.filter((suggestion) => {
			if (seen.has(suggestion.title)) return false;
			seen.add(suggestion.title);
			return true;
		}).map((suggestion) => ({
			value: suggestion.title,
			label: suggestion.title,
			description: suggestion.description
		}));
	});
}

function checkTitle(): void {
	if (!active) return;
	cancelRequest('check');
	status.value = '';
	const value = String(target.value).trim();
	const service = services?.checkTitle;
	if (!value || !titleServicesEnabled.value || !service) return;
	const context = beginRequest('check');
	request('check', () => service(value, context), (result) => {
		const key = result.disambiguation ? 'disambig' : result.exists === true ? 'exists' : result.exists === false ? 'notexists' : null;
		status.value = key ? msg(`wikieditor-toolbar-tool-link-int-target-status-${key}`) : '';
	});
}

watch(mode, () => {
	selectedTitle.value = null;
	onTitleInput(target.value);
});

function onPickerChange(): void {
	cancelRequest('upload');
	clearError();
}

function upload(): void {
	guard(() => {
		const file = picker.value?.files?.[0];
		const service = services?.uploadFile;
		if (!file) {
			invalid(fallback('modern-wikieditor-file-choose', 'Choose a file to upload.'), 'picker');
			return;
		}
		if (!service) return;
		const context = beginRequest('upload');
		request('upload', () => service(file, context), (result) => {
			if (!result.title.trim())
				throw new Error(fallback('modern-wikieditor-upload-empty', 'The upload service returned an empty file title.'));
			selectedTitle.value = null;
			onTitleInput(result.title);
		});
	});
}

function insert(action: () => void): void {
	restoreSelection();
	try {
		action();
	} finally {
		// onChange may synchronously unmount this component; do not call engine methods.
		rememberSelection();
	}
	close();
}

function positiveInteger(value: string | number): boolean {
	return /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function submit(): void {
	guard(() => {
		if (props.name === 'replace') {
			runReplace('find');
			return;
		}
		if (props.name === 'link') {
			if (!String(target.value).trim()) {
				invalid(msg('wikieditor-toolbar-tool-link-int-target-status-invalid'), 'target');
				return;
			}
			insert(() => host.insertLink(String(target.value).trim(), String(label.value), mode.value === 'external'));
		} else if (props.name === 'file') {
			if (!String(target.value).trim()) {
				invalid(fallback('modern-wikieditor-file-required', 'Enter a filename.'), 'target');
				return;
			}
			if (String(size.value) && !positiveInteger(size.value)) {
				invalid(fallback('modern-wikieditor-file-invalid-size', 'Size must be a positive integer.'), 'size');
				return;
			}
			const options: FileInsertOptions = {
				title: String(target.value).trim(),
				caption: String(caption.value),
				alt: String(alt.value),
				format: format.value as FileInsertOptions['format']
			};
			if (String(size.value)) options.size = Number(size.value);
			if (align.value) options.align = align.value as FileInsertOptions['align'];
			insert(() => host.insertFile(options));
		} else {
			for (const [field, value] of [['rows', rows.value], ['columns', columns.value]] as const) {
				if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
					invalid(msg('wikieditor-toolbar-tool-table-invalidnumber'), field);
					return;
				}
				if (Number(value) < 1) {
					invalid(msg('wikieditor-toolbar-tool-table-zero'), field);
					return;
				}
			}
			const limit = host.options.maxTableCells ?? 10000;
			if (!Number.isSafeInteger(limit) || limit < 1)
				throw new Error('maxTableCells must be a positive safe integer.');
			const totalRows = Number(rows.value) + (header.value ? 1 : 0);
			if (totalRows > Math.floor(limit / Number(columns.value))) {
				invalid(msg('wikieditor-toolbar-tool-table-toomany', limit), 'rows');
				return;
			}
			insert(() => host.insertTable({
				rows: Number(rows.value),
				columns: Number(columns.value),
				header: header.value,
				wikitable: wikitable.value,
				sortable: sortable.value,
				caption: String(caption.value)
			}));
		}
	});
}

function runReplace(action: 'find' | 'replace' | 'all'): void {
	status.value = '';
	const query = String(search.value);
	if (!query) {
		invalid(msg('wikieditor-toolbar-tool-replace-emptysearch'), 'search');
		return;
	}
	if (regex.value)
		try {
			RegExp(query, caseSensitive.value ? 'g' : 'gi');
		} catch (reason: unknown) {
			invalid(msg('wikieditor-toolbar-tool-replace-invalidregex', reason instanceof Error ? reason.message : String(reason)), 'search');
			host.reportError(reason);
			return;
		}
	const options = {
		caseSensitive: caseSensitive.value,
		regex: regex.value,
		wholeWord: wholeWord.value
	};
	restoreSelection();
	let count: number;
	try {
		if (action === 'find') count = host.findNext(query, options) ? 1 : 0;
		else if (action === 'replace')
			count = host.replaceSelection(query, String(replacement.value), options) ? 1 : 0;
		else count = host.replaceAll(query, String(replacement.value), options);
	} finally {
		rememberSelection();
	}
	if (!active) return;
	if (!count) invalid(msg('wikieditor-toolbar-tool-replace-nomatch'));
	else if (action !== 'find') status.value = msg('wikieditor-toolbar-tool-replace-success', count);
}

let menuEnter = false;

// Snapshot expansion before Codex handles Enter and collapses its menu.
function onKeydownCapture(event: KeyboardEvent): void {
	const element = event.target as HTMLElement | null;
	menuEnter = event.key === 'Enter' && element?.getAttribute('role') === 'combobox' &&
		element.getAttribute('aria-expanded') === 'true';
}

/**
 * Let Codex commit menu selection; never turn that same Enter into form insertion.
 *
 * @param {KeyboardEvent} event Native key event.
 */
function onKeydown(event: KeyboardEvent): void {
	if (event.key !== 'Enter') return;
	const element = event.target as HTMLElement | null;
	if (menuEnter || event.isComposing || event.defaultPrevented ||
		(element?.getAttribute('role') === 'combobox' && element.getAttribute('aria-expanded') === 'true'))
		event.preventDefault();
}

function fieldStatus(field: string): 'default' | 'error' {
	return errorField.value === field ? 'error' : 'default';
}
</script>

<style scoped>
.modern-wikieditor-dialog__form {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-100, 1rem);
}

.modern-wikieditor-dialog__form > .cdx-field {
	margin-block-start: 0;
	min-inline-size: 0;
}

.modern-wikieditor-dialog__select {
	inline-size: 100%;
}

.modern-wikieditor-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: var(--spacing-75, 0.75rem);
}

.modern-wikieditor-dialog__status {
	margin: 0;
	white-space: pre-line;
}

.modern-wikieditor-dialog__status:empty {
	display: none;
}
</style>
