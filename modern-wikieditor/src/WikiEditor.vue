<template>
	<div
		ref="shell"
		class="modern-wikieditor"
		v-bind="$attrs"
		:dir="host?.direction"
		:lang="host?.language">
		<editor-toolbar
			v-if="host"
			:host="host"
			:tools="tools"
			:active-panel="activePanel"
			:disabled="disabled || readonly"
			@tool="execute"
			@insert="insert"
			@panel="togglePanel"
			@heading="heading" />
		<div ref="mountPoint" class="modern-wikieditor__input" />
		<div
			v-if="host && host.options.resizable !== false"
			class="modern-wikieditor__resizer"
			tabindex="0"
			role="separator"
			aria-orientation="horizontal"
			:aria-label="host.msg( 'wikieditor-toolbar' )"
			:aria-valuenow="height"
			aria-valuemin="100"
			@pointerdown="startResize"
			@pointermove="moveResize"
			@pointerup="stopResize"
			@pointercancel="stopResize"
			@lostpointercapture="stopResize"
			@keydown="keyboardResize" />
		<div
			v-if="host?.options.services?.renderPreview"
			class="modern-wikieditor__preview-controls">
			<cdx-toggle-button
				type="button"
				:model-value="previewEnabled"
				@update:model-value="togglePreview">
				{{ host.msg( 'wikieditor-realtimepreview-preview' ) }}
			</cdx-toggle-button>
		</div>
		<section
			v-if="host && previewEnabled"
			class="modern-wikieditor__preview"
			aria-live="polite"
			:aria-label="host.msg( 'wikieditor-realtimepreview-preview' )"
			:aria-busy="previewBusy">
			<p v-if="previewError" role="alert">
				{{ previewError }}
			</p>
			<!-- The renderPreview service contract requires host-sanitized HTML. -->
			<div v-else v-html="previewHtml" />
		</section>
		<editor-dialog
			v-if="host && dialog"
			:key="`${generation}-${dialog}`"
			:host="host"
			:name="dialog"
			:restore-on-dispose="disposalGuard( host )"
			@close="closeDialog" />
	</div>
</template>

<script lang="ts">
import {defineComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue';
import type {PropType, TextareaHTMLAttributes} from 'vue';
import {CdxToggleButton} from '@wikimedia/codex';
import {WikiEditorEngine} from './engine';
import EditorToolbar from './EditorToolbar.vue';
import EditorDialog from './EditorDialog.vue';
import {createTools} from './tools';
import type {DialogName, PanelName, ToolDefinition, WikiEditorComponentOptions, WikiEditorExpose} from './types';

export default defineComponent({
	name: 'WikiEditor',
	components: {CdxToggleButton, EditorToolbar, EditorDialog},
	inheritAttrs: false,
	props: {
		modelValue: {type: String, default: ''},
		options: {type: Object as PropType<WikiEditorComponentOptions>, default: () => ({})},
		disabled: Boolean,
		readonly: Boolean,
		textareaAttrs: {type: Object as PropType<TextareaHTMLAttributes>, default: () => ({})}
	},
	emits: {
		'update:modelValue': (value: string): boolean => typeof value === 'string',
		change: (value: string): boolean => typeof value === 'string',
		ready: (): boolean => true,
		destroy: (): boolean => true,
		error: (error: Error): boolean => error instanceof Error,
		'preference-change': (key: string, value: unknown): boolean => Boolean(key) && value !== undefined,
		focus: (event: FocusEvent): boolean => Boolean(event),
		blur: (event: FocusEvent): boolean => Boolean(event)
	},
	setup(props, {emit, expose}) {
		const shell = ref<HTMLElement | null>(null);
		const mountPoint = ref<HTMLElement | null>(null);
		const host = shallowRef<WikiEditorEngine | null>(null);
		const tools = shallowRef<readonly ToolDefinition[]>([]);
		const activePanel = ref<PanelName | null>(null);
		const dialog = ref<DialogName | null>(null);
		const generation = ref(0);
		const previewEnabled = ref(false);
		const previewHtml = ref('');
		const previewError = ref('');
		const previewBusy = ref(false);
		const height = ref(300);
		let textarea: HTMLTextAreaElement | null = null;
		let mounted = false;
		let composing = false;
		let syncing = false;
		let attrs = new Set<string>();
		let previewRequest: AbortController | null = null;
		let previewTimer: ReturnType<typeof setTimeout> | undefined;
		let revision = 0;
		let savedSelection = {start: 0, end: 0, direction: 'none' as 'forward' | 'backward' | 'none'};
		let resizePointer: number | null = null;
		let resizeStart = 0;
		let resizeHeight = 0;

		function report(error: unknown): void {
			try {
				emit('error', error instanceof Error ? error : new Error(String(error)));
			} catch {
				// Host error listeners must not interrupt request cancellation or teardown.
			}
		}

		function remember(): void {
			if (textarea) savedSelection = {
				start: textarea.selectionStart,
				end: textarea.selectionEnd,
				direction: textarea.selectionDirection
			};
		}

		function invalidatePreview(): void {
			revision++;
			clearTimeout(previewTimer);
			previewRequest?.abort();
			previewRequest = null;
			previewBusy.value = false;
		}

		async function refreshPreview(): Promise<void> {
			const engine = host.value;
			const render = engine?.options.services?.renderPreview;
			if (!engine || !render || !previewEnabled.value) return;
			invalidatePreview();
			const current = revision;
			const request = new AbortController();
			previewRequest = request;
			previewBusy.value = true;
			previewError.value = '';
			try {
				const context = {signal: request.signal, language: engine.language};
				const html = await render(engine.getValue(), context);
				if (request.signal.aborted || revision !== current || host.value !== engine) return;
				// Only the host may cross this trusted, already-sanitized HTML boundary.
				previewHtml.value = html;
			} catch (error) {
				if (!request.signal.aborted && revision === current && host.value === engine) {
					previewError.value = engine.msg('wikieditor-realtimepreview-error');
					report(error);
				}
			} finally {
				if (revision === current) previewBusy.value = false;
			}
		}

		function changed(value: string): void {
			remember();
			if (!syncing && !composing) {
				if (value !== props.modelValue) emit('update:modelValue', value);
				emit('change', value);
			}
			if (previewEnabled.value) {
				invalidatePreview();
				previewTimer = setTimeout(() => {
					refreshPreview().catch(report);
				}, host.value?.options.previewDebounce ?? 500);
			}
		}

		function syncAttrs(): void {
			if (!textarea) return;
			const next = new Set<string>();
			for (const [key, value] of Object.entries(props.textareaAttrs)) {
				if (/^(on|innerHTML|outerHTML|textContent|value|defaultValue|disabled|readonly|ref|key|class|style)/i.test(key)) continue;
				if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
				if (value === false) continue;
				const name = key.toLowerCase();
				textarea.setAttribute(name, value === true ? '' : String(value));
				next.add(name);
			}
			for (const name of attrs) if (!next.has(name)) textarea.removeAttribute(name);
			attrs = next;
			textarea.disabled = props.disabled;
			textarea.readOnly = props.readonly;
		}

		function syncValue(): void {
			if (!textarea || composing || textarea.value === props.modelValue) return;
			const {selectionStart, selectionEnd, selectionDirection} = textarea;
			syncing = true;
			try {
				if (host.value) host.value.setValue(props.modelValue);
				else textarea.value = props.modelValue;
				textarea.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
				remember();
			} finally {
				syncing = false;
			}
		}

		function release(): void {
			invalidatePreview();
			dialog.value = null;
			if (!host.value) return;
			host.value.destroy();
			host.value = null;
			emit('destroy');
		}

		function addTool(tool: ToolDefinition): void {
			tools.value = [...tools.value.filter((item) => item.id !== tool.id), tool];
		}

		function togglePanel(name: PanelName): void {
			activePanel.value = activePanel.value === name ? null : name;
		}

		function reinitialize(): void {
			if (!mounted || !textarea || !shell.value) return;
			release();
			generation.value++;
			activePanel.value = null;
			previewEnabled.value = false;
			previewHtml.value = '';
			previewError.value = '';
			syncAttrs();
			syncValue();
			try {
				const engine = new WikiEditorEngine(textarea, shell.value, {
					...props.options,
					onChange: changed,
					onError: report,
					onPreferenceChange: (key, value) => emit('preference-change', key, value)
				}, {
					openDialog: (name) => {
						dialog.value = name;
					},
					togglePanel,
					addTool,
					removeTool: (id) => {
						tools.value = tools.value.filter((item) => item.id !== id);
					}
				});
				host.value = engine;
				tools.value = createTools(engine);
				for (const tool of engine.options.tools ?? []) addTool(tool);
				const preferred = engine.getPreference('height');
				height.value = typeof preferred === 'number' && Number.isFinite(preferred) ? Math.max(100, preferred) : 300;
				textarea.style.resize = engine.options.resizable === false ? 'none' : 'vertical';
				textarea.style.height = `${height.value}px`;
				textarea.dir = engine.direction;
				textarea.lang = engine.language;
				remember();
				emit('ready');
			} catch (error) {
				release();
				report(error);
			}
		}

		function run(action: ToolDefinition['action']): void {
			const engine = host.value;
			if (!engine || !textarea) return;
			try {
				if (textarea.ownerDocument.activeElement === textarea) remember();
				textarea.setSelectionRange(
					savedSelection.start, savedSelection.end, savedSelection.direction
				);
				engine.focus();
				action(engine);
				remember();
			} catch (error) {
				report(error);
			}
		}

		function execute(tool: ToolDefinition): void {
			run((engine) => tool.action(engine));
		}

		function heading(level: number): void {
			if (level < 2 || level > 5) return;
			const marks = '='.repeat(level);
			run((engine) => engine.encapsulate({
				pre: `${marks} `,
				post: ` ${marks}`,
				peri: engine.msg('wikieditor-toolbar-tool-heading-example'),
				ownline: true,
				regex: /^(\s*)(={1,6})(.*?)\2(\s*)$/,
				regexReplace: `$1${marks}$3${marks}$4`
			}));
		}

		function hotkey(event: KeyboardEvent): void {
			const ignored = event.defaultPrevented || event.isComposing || event.altKey;
			const unavailable = event.shiftKey || props.disabled || props.readonly;
			if (ignored || unavailable || !(event.ctrlKey || event.metaKey)) return;
			const key = event.key.toLowerCase();
			const tool = tools.value.find((item) => item.hotkey?.toLowerCase() === key);
			if (tool) {
				event.preventDefault();
				execute(tool);
			}
		}

		function togglePreview(enabled: boolean): void {
			previewEnabled.value = enabled;
			invalidatePreview();
			host.value?.setPreference('preview', previewEnabled.value);
			if (previewEnabled.value) refreshPreview().catch(report);
		}

		function resize(next: number): void {
			height.value = Math.max(100, Math.round(next));
			if (textarea) textarea.style.height = `${height.value}px`;
		}

		function startResize(event: PointerEvent): void {
			if (event.button !== 0 || !textarea) return;
			event.preventDefault();
			resizePointer = event.pointerId;
			resizeStart = event.clientY;
			resizeHeight = textarea.getBoundingClientRect().height;
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}

		function moveResize(event: PointerEvent): void {
			if (resizePointer === event.pointerId)
				resize(resizeHeight + event.clientY - resizeStart);
		}

		function stopResize(event: PointerEvent): void {
			if (resizePointer !== event.pointerId) return;
			resizePointer = null;
			const bar = event.currentTarget as HTMLElement;
			if (bar.hasPointerCapture(event.pointerId)) bar.releasePointerCapture(event.pointerId);
			host.value?.setPreference('height', height.value);
		}

		function keyboardResize(event: KeyboardEvent): void {
			if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
			event.preventDefault();
			resize((textarea?.getBoundingClientRect().height ?? height.value) + (event.key === 'ArrowUp' ? -20 : 20));
			host.value?.setPreference('height', height.value);
		}

		const api: WikiEditorExpose = {
			getEditor: (): never => {
				throw new Error('modern-wikieditor does not expose a legacy WikiEditor instance. Use getTextarea() or custom tool callbacks.');
			},
			getTextarea: () => textarea,
			focus: () => textarea?.focus(),
			reinitialize
		};
		expose(api);
		onMounted(() => {
			if (!mountPoint.value) return;
			mounted = true;
			textarea = mountPoint.value.ownerDocument.createElement('textarea');
			textarea.className = 'modern-wikieditor__textarea';
			textarea.value = props.modelValue;
			textarea.addEventListener('compositionstart', () => {
				composing = true;
			});
			textarea.addEventListener('compositionend', () => {
				composing = false;
				if (textarea) changed(textarea.value);
			});
			textarea.addEventListener('focus', (event) => emit('focus', event));
			textarea.addEventListener('blur', (event) => {
				remember();
				emit('blur', event);
			});
			for (const name of [
				'select',
				'keyup',
				'mouseup'
			]) textarea.addEventListener(name, remember);
			textarea.addEventListener('keydown', hotkey);
			mountPoint.value.append(textarea);
			reinitialize();
		});
		watch(() => props.modelValue, syncValue);
		watch(() => props.options, reinitialize);
		watch(() => [
			props.disabled,
			props.readonly,
			props.textareaAttrs
		], syncAttrs, {deep: true});
		onBeforeUnmount(() => {
			mounted = false;
			release();
			textarea?.remove();
			textarea = null;
		});

		function disposalGuard(engine: WikiEditorEngine): () => boolean {
			return () => mounted && host.value === engine;
		}

		async function closeDialog(): Promise<void> {
			dialog.value = null;
			await nextTick();
			remember();
		}

		return {
			shell,
			mountPoint,
			host,
			tools,
			activePanel,
			dialog,
			generation,
			previewEnabled,
			previewHtml,
			previewError,
			previewBusy,
			height,
			execute,
			heading,
			togglePanel,
			togglePreview,
			startResize,
			moveResize,
			stopResize,
			keyboardResize,
			closeDialog,
			disposalGuard,
			insert: (text: string): void => run((engine) => engine.insertText(text))
		};
	}
});
</script>
