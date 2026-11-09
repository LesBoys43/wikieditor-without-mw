import {
	defineComponent, h, onBeforeUnmount, onMounted, ref, watch,
} from 'vue';
import type {PropType, TextareaHTMLAttributes} from 'vue';
import {WikiEditor as Editor} from 'wikieditor-without-mw';
import type {WikiEditorOptions} from 'wikieditor-without-mw';

export type WikiEditorComponentOptions = Omit<
	WikiEditorOptions, 'onChange' | 'onError' | 'onPreferenceChange'
>;

export interface WikiEditorExpose {
	getEditor(): Editor | null;
	getTextarea(): HTMLTextAreaElement | null;
	focus(): void;
	reinitialize(): void;
}

/** Vue owns the shell; the editor exclusively owns the shell's mounted textarea. */
export const WikiEditor = defineComponent({
	name: 'WikiEditor',
	inheritAttrs: false,
	props: {
		modelValue: {type: String, default: ''},
		options: {type: Object as PropType<WikiEditorComponentOptions>, default: () => ({})},
		disabled: Boolean,
		readonly: Boolean,
		textareaAttrs: {
			type: Object as PropType<TextareaHTMLAttributes>, default: () => ({}),
		},
	},
	emits: {
		'update:modelValue': (value: string): boolean => typeof value === 'string',
		change: (value: string): boolean => typeof value === 'string',
		ready: (editor: Editor): boolean => Boolean(editor),
		destroy: (): boolean => true,
		error: (error: Error): boolean => error instanceof Error,
		'preference-change': (key: string, value: unknown): boolean => Boolean(key) && value !== undefined,
		focus: (event: FocusEvent): boolean => Boolean(event),
		blur: (event: FocusEvent): boolean => Boolean(event),
	},
	setup(props, {attrs, emit, expose}) {
		const shell = ref<HTMLElement | null>(null);
		let textarea: HTMLTextAreaElement | null = null;
		let editor: Editor | null = null;
		let mounted = false;
		let syncing = false;
		let composing = false;
		let appliedAttrs = new Set<string>();

		function report(error: unknown): void {
			emit('error', error instanceof Error ? error : new Error(String(error)));
		}

		function release(): void {
			if (!editor) return;
			editor.destroy();
			editor = null;
			emit('destroy');
		}

		function changed(value: string): void {
			if (syncing || composing) return;
			if (value !== props.modelValue) emit('update:modelValue', value);
			emit('change', value);
		}

		function syncValue(): void {
			if (!textarea || composing || textarea.value === props.modelValue) return;
			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			syncing = true;
			try {
				if (editor) editor.setValue(props.modelValue);
				else textarea.value = props.modelValue;
				textarea.setSelectionRange(start, end);
			} finally {
				syncing = false;
			}
		}

		function syncAttrs(): void {
			if (!textarea) return;
			// Only primitive HTML attributes are accepted, never event/HTML injection.
			const next = new Set<string>();
			for (const [key, value] of Object.entries(props.textareaAttrs)) {
				if (/^(on|innerHTML|outerHTML|textContent|value|defaultValue|disabled|readonly|ref|key|class|style)/i.test(key))
					continue;
				if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
					continue;
				const name = key.toLowerCase();
				if (value === false) continue;
				textarea.setAttribute(name, value === true ? '' : String(value));
				next.add(name);
			}
			for (const key of appliedAttrs)
				if (!next.has(key)) textarea.removeAttribute(key);
			appliedAttrs = next;
			textarea.disabled = props.disabled;
			textarea.readOnly = props.readonly;
		}

		function reinitialize(): void {
			if (!mounted || !textarea) return;
			release();
			syncAttrs();
			syncValue();
			try {
				editor = new Editor(textarea, {
					...props.options,
					onChange: changed,
					onError: report,
					onPreferenceChange: (key, value) => emit('preference-change', key, value),
				});
				emit('ready', editor);
			} catch (error) {
				report(error);
			}
		}

		const api: WikiEditorExpose = {
			getEditor: () => editor,
			getTextarea: () => textarea,
			focus: () => textarea?.focus(),
			reinitialize,
		};
		expose(api);
		onMounted(() => {
			if (!shell.value) return;
			mounted = true;
			textarea = shell.value.ownerDocument.createElement('textarea');
			textarea.value = props.modelValue;
			textarea.addEventListener('compositionstart', () => { composing = true; });
			textarea.addEventListener('compositionend', () => {
				composing = false;
				if (textarea) changed(textarea.value);
			});
			textarea.addEventListener('focus', (event) => emit('focus', event));
			textarea.addEventListener('blur', (event) => emit('blur', event));
			shell.value.append(textarea);
			reinitialize();
		});
		watch(() => props.modelValue, syncValue);
		watch(() => props.options, reinitialize);
		watch(() => [props.disabled, props.readonly, props.textareaAttrs], syncAttrs, {deep: true});
		onBeforeUnmount(() => {
			mounted = false;
			release();
			textarea?.remove();
			textarea = null;
		});
		// No Vue VNodes below this shell: DOM reparenting by the editor is safe.
		return () => h('div', {...attrs, ref: shell});
	},
});
