import {DialogManager} from './dialogs';
import {MessageCatalog} from './messages';
import {TextSelection} from './text';
import {Toolbar} from './toolbar';
import type {
	DialogName, EditorHost, EncapsulateOptions, FileInsertOptions, MagicWords,
	PanelName, PreferenceValue, SearchOptions, SelectionRange, TableInsertOptions,
	ToolDefinition, WikiEditorOptions,
} from './types';

const activeEditors = new WeakMap<HTMLTextAreaElement, WikiEditor>();

/** Standalone Wikitext editing UI. Importing this module has no DOM side effects. */
export class WikiEditor implements EditorHost {
	readonly textarea: HTMLTextAreaElement;
	readonly element: HTMLElement;
	readonly options: WikiEditorOptions;
	readonly language: string;
	readonly direction: 'ltr' | 'rtl';
	readonly magicWords: MagicWords;
	private readonly catalog: MessageCatalog;
	private readonly selection: TextSelection;
	private readonly toolbar: Toolbar;
	private readonly dialogs: DialogManager;
	private readonly cleanup: (() => void)[] = [];
	private readonly originalClass: string;
	private readonly originalStyle: string | null;
	private readonly preferences: Record<string, PreferenceValue>;
	private destroyed = false;
	private previewPane?: HTMLElement;
	private previewButton?: HTMLButtonElement;
	private previewRequest?: AbortController;
	private previewTimer?: ReturnType<typeof setTimeout>;
	private previewEnabled = false;
	private previewRevision = 0;

	constructor(textarea: HTMLTextAreaElement, options: WikiEditorOptions = {}) {
		if (!textarea || textarea.tagName !== 'TEXTAREA' || !textarea.parentNode)
			throw new TypeError('WikiEditor requires an attached textarea element.');
		if (activeEditors.has(textarea))
			throw new Error('This textarea already has a WikiEditor instance.');
		this.textarea = textarea;
		this.options = {...options};
		this.language = options.language || 'en';
		this.direction = options.direction || (/^(ar|arc|ary|arz|azb|bcc|bgn|ckb|fa|he|ks|lki|lrc|mzn|nqo|pnb|ps|sd|sdh|skr-arab|ug|ur|yi)(-|$)/i.test(this.language) ? 'rtl' : 'ltr');
		this.magicWords = {
			redirect: 'REDIRECT', thumbnail: 'thumb', left: 'left', center: 'center',
			right: 'right', none: 'none', frame: 'frame', frameless: 'frameless', alt: 'alt',
			...options.magicWords,
		};
		this.catalog = new MessageCatalog(this.language, options);
		this.selection = new TextSelection(textarea);
		this.preferences = {...options.preferences};
		this.originalClass = textarea.className;
		this.originalStyle = textarea.getAttribute('style');
		const doc = textarea.ownerDocument;
		this.element = doc.createElement('div');
		this.element.className = 'wikiEditor';
		this.element.lang = this.language;
		this.element.dir = this.direction;
		textarea.parentNode.insertBefore(this.element, textarea);
		textarea.classList.add('wikiEditor-textarea');
		this.toolbar = new Toolbar(this);
		this.element.append(this.toolbar.element, textarea);
		this.dialogs = new DialogManager(this);
		this.listen(textarea, 'input', () => this.changed());
		this.listen(textarea, 'keydown', (event) => {
			const keyEvent = event as KeyboardEvent;
			if (!(keyEvent.ctrlKey || keyEvent.metaKey) || keyEvent.altKey || keyEvent.isComposing)
				return;
			if (textarea.disabled || textarea.readOnly)
				return;
			const key = keyEvent.key.toLowerCase();
			if (key === 'b' || key === 'i') {
				keyEvent.preventDefault();
				const marks = key === 'b' ? "'''" : "''";
				this.encapsulate({pre: marks, post: marks, peri: this.msg(`wikieditor-toolbar-tool-${key === 'b' ? 'bold' : 'italic'}-example`)});
			}
		});
		if (options.resizable !== false)
			this.createResizer();
		if (options.services?.renderPreview)
			this.createPreview();
		activeEditors.set(textarea, this);
	}

	private listen(target: EventTarget, name: string, callback: EventListener): void {
		target.addEventListener(name, callback);
		this.cleanup.push(() => target.removeEventListener(name, callback));
	}

	private assertActive(): void {
		if (this.destroyed)
			throw new Error('WikiEditor has been destroyed.');
	}

	private editable(): boolean {
		this.assertActive();
		return !this.textarea.disabled && !this.textarea.readOnly;
	}

	msg(key: string, ...params: (string | number)[]): string {
		return this.catalog.get(key, ...params);
	}

	getValue(): string {
		this.assertActive();
		return this.textarea.value;
	}

	setValue(value: string): void {
		this.assertActive();
		if (this.textarea.value === value)
			return;
		this.textarea.value = value;
		this.emitInput();
	}

	getSelection(): SelectionRange {
		this.assertActive();
		return this.selection.get();
	}

	setSelection(start: number, end = start): void {
		this.assertActive();
		this.selection.set(start, end);
	}

	getSelectedText(): string {
		const {start, end} = this.getSelection();
		return this.getValue().slice(start, end);
	}

	focus(): void {
		this.assertActive();
		this.textarea.focus({preventScroll: true});
	}

	insertText(text: string): void {
		if (!this.editable())
			return;
		this.selection.replace(text);
		this.focus();
		this.emitInput();
	}

	encapsulate(options: EncapsulateOptions): void {
		if (!this.editable())
			return;
		const pre = options.pre || '';
		const post = options.post || '';
		let {start, end} = this.getSelection();
		const value = this.getValue();
		if (options.ownline) {
			start = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
			const next = value.indexOf('\n', end);
			end = next === -1 ? value.length : next;
		}
		const selected = value.slice(start, end);
		const middle = selected || options.peri || '';
		let output: string;
		if (options.regex && selected && options.regexReplace !== undefined) {
			options.regex.lastIndex = 0;
			if (options.regex.test(selected)) {
				options.regex.lastIndex = 0;
				output = selected.replace(options.regex, options.regexReplace);
			} else {
				output = pre + middle + post;
			}
		} else {
			output = options.splitlines ? middle.split('\n').map((line) => pre + line + post).join('\n') : pre + middle + post;
		}
		this.selection.set(start, end);
		this.selection.replace(output, true);
		if (!selected && middle && !options.splitlines)
			this.selection.set(start + pre.length, start + pre.length + middle.length);
		this.focus();
		this.emitInput();
	}

	insertLink(target: string, label = '', external = false): void {
		const title = target.trim();
		if (!title || /[\n\r\[\]<>|]/.test(title) || /[\n\r\[\]<>|]/.test(label))
			throw new Error('Invalid link target or label.');
		if (external) {
			const protocols = this.options.allowedProtocols || ['https:', 'http:', 'mailto:', 'ftp:', '//'];
			if (!protocols.some((protocol) => title.toLowerCase().startsWith(protocol.toLowerCase())))
				throw new Error('The external link protocol is not allowed.');
			this.insertText(`[${title}${label ? ` ${label}` : ''}]`);
		} else {
			this.insertText(`[[${title}${label && label !== title ? `|${label}` : ''}]]`);
		}
	}

	insertFile(options: FileInsertOptions): void {
		const namespace = this.options.fileNamespace || 'File';
		let title = options.title.trim();
		if (title.toLowerCase().startsWith(`${namespace.toLowerCase()}:`))
			title = title.slice(namespace.length + 1);
		if (!title || /[\n\r\[\]<>|]/.test(title))
			throw new Error('Invalid filename.');
		const parts = [`${namespace}:${title}`];
		if (options.format && options.format !== 'none')
			parts.push(this.magicWords[options.format]);
		if (options.align)
			parts.push(this.magicWords[options.align]);
		if (options.size !== undefined) {
			if (!Number.isSafeInteger(options.size) || options.size < 1)
				throw new Error('File size must be a positive integer.');
			parts.push(`${options.size}px`);
		}
		if (options.alt) {
			if (/[\n\r|\[\]]/.test(options.alt))
				throw new Error('Alternative text cannot contain Wikitext delimiters.');
			parts.push(`${this.magicWords.alt}=${options.alt}`);
		}
		if (options.caption)
			parts.push(options.caption);
		this.insertText(`[[${parts.join('|')}]]`);
	}

	insertTable(options: TableInsertOptions): void {
		const {rows, columns} = options;
		if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns) || rows < 1 || columns < 1)
			throw new Error(this.msg('wikieditor-toolbar-tool-table-invalidnumber'));
		const limit = this.options.maxTableCells ?? 10000;
		if (rows * columns + (options.header ? columns : 0) > limit)
			throw new Error(this.msg('wikieditor-toolbar-tool-table-toomany', limit));
		const classes = [options.wikitable ? 'wikitable' : '', options.sortable ? 'sortable' : ''].filter(Boolean);
		const lines = [classes.length ? `{| class="${classes.join(' ')}"` : '{|'];
		if (options.caption)
			lines.push(`|+ ${options.caption}`);
		if (options.header)
			lines.push(Array.from({length: columns}, () => `! ${this.msg('wikieditor-toolbar-tool-table-example-header')}`).join(' !! ').replace(/ !! ! /g, ' !! '));
		for (let row = 0; row < rows; row++) {
			lines.push('|-');
			lines.push(`| ${Array.from({length: columns}, () => this.msg('wikieditor-toolbar-tool-table-example-cell-text')).join(' || ')}`);
		}
		lines.push('|}');
		const {start, end} = this.getSelection();
		const value = this.getValue();
		this.insertText(`${start && value[start - 1] !== '\n' ? '\n' : ''}${lines.join('\n')}${end < value.length && value[end] !== '\n' ? '\n' : ''}`);
	}

	findNext(search: string, options: SearchOptions = {}): SelectionRange | null {
		const pattern = TextSelection.pattern(search, options);
		const value = this.getValue();
		pattern.lastIndex = this.getSelection().end;
		let match = pattern.exec(value);
		if (!match) {
			pattern.lastIndex = 0;
			match = pattern.exec(value);
		}
		if (!match)
			return null;
		const range = {start: match.index, end: match.index + match[0].length};
		this.setSelection(range.start, range.end);
		return range;
	}

	replaceSelection(search: string, replacement: string, options: SearchOptions = {}): boolean {
		if (!this.editable())
			return false;
		const pattern = TextSelection.pattern(search, options);
		const {start, end} = this.getSelection();
		const value = this.getValue();
		pattern.lastIndex = start;
		const match = pattern.exec(value);
		if (!match || match.index !== start || match.index + match[0].length !== end)
			return false;
		let text = replacement;
		if (options.regex) {
			// Let the engine expand captures using the full input (including lookarounds).
			let replaced = false;
			const replacedValue = value.replace(pattern, (...args: unknown[]) => {
				const offset = typeof args[args.length - 2] === 'number' ? args[args.length - 2] : args[args.length - 3];
				if (offset !== start || replaced)
					return String(args[0]);
				replaced = true;
				return this.expandReplacement(replacement, match, value);
			});
			text = replacedValue.slice(start, replacedValue.length - (value.length - end));
		}
		this.selection.replace(text);
		this.emitInput();
		return true;
	}

	private expandReplacement(replacement: string, match: RegExpExecArray, value: string): string {
		return replacement.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]+>)/g, (token, group: string) => {
			if (group === '$')
				return '$';
			if (group === '&')
				return match[0];
			if (group === '`')
				return value.slice(0, match.index);
			if (group === "'")
				return value.slice(match.index + match[0].length);
			if (group.startsWith('<'))
				return match.groups ? match.groups[group.slice(1, -1)] || '' : token;
			const index = Number(group);
			if (index > 0 && index < match.length)
				return match[index] || '';
			if (group.length === 2 && Number(group[0]) > 0 && Number(group[0]) < match.length)
				return (match[Number(group[0])] || '') + group[1];
			return token;
		});
	}

	replaceAll(search: string, replacement: string, options: SearchOptions = {}): number {
		if (!this.editable())
			return 0;
		const pattern = TextSelection.pattern(search, options);
		const value = this.getValue();
		let count = 0;
		const output = value.replace(pattern, (...args: unknown[]) => {
			count++;
			if (!options.regex)
				return replacement;
			const named = typeof args[args.length - 1] === 'object';
			const offsetIndex = args.length - (named ? 3 : 2);
			const match = args.slice(0, offsetIndex) as RegExpExecArray;
			match.index = Number(args[offsetIndex]);
			match.input = value;
			if (named)
				match.groups = args[args.length - 1] as Record<string, string>;
			return this.expandReplacement(replacement, match, value);
		});
		if (count)
			this.setValue(output);
		return count;
	}

	openDialog(name: DialogName): void {
		if (this.editable())
			this.dialogs.open(name);
	}

	togglePanel(name: PanelName): void {
		this.assertActive();
		this.toolbar.togglePanel(name);
	}

	addTool(tool: ToolDefinition): void {
		this.assertActive();
		this.toolbar.addTool(tool);
	}

	removeTool(id: string): void {
		this.assertActive();
		this.toolbar.removeTool(id);
	}

	getPreference(key: string): PreferenceValue | undefined {
		this.assertActive();
		const value = this.preferences[key];
		return Array.isArray(value) ? value.slice() : value;
	}

	setPreference(key: string, value: PreferenceValue): void {
		this.assertActive();
		this.preferences[key] = Array.isArray(value) ? value.slice() : value;
		try {
			this.options.onPreferenceChange?.(key, value);
		} catch (error) {
			this.reportError(error);
		}
	}

	private emitInput(): void {
		const EventClass = this.textarea.ownerDocument.defaultView?.Event;
		if (EventClass)
			this.textarea.dispatchEvent(new EventClass('input', {bubbles: true}));
		else
			this.changed();
	}

	private changed(): void {
		try {
			this.options.onChange?.(this.textarea.value);
		} catch (error) {
			this.reportError(error);
		}
		if (this.previewEnabled) {
			// Invalidate in-flight results immediately, not only after the debounce.
			this.previewRevision++;
			this.previewRequest?.abort();
			clearTimeout(this.previewTimer);
			this.previewTimer = setTimeout(() => void this.refreshPreview(), this.options.previewDebounce ?? 500);
		}
	}

	reportError(error: unknown): void {
		const problem = error instanceof Error ? error : new Error(String(error));
		if (this.options.onError) {
			try {
				this.options.onError(problem);
			} catch {
				// User error handlers must not break cleanup or event delivery.
			}
		}
	}

	private createPreview(): void {
		const doc = this.textarea.ownerDocument;
		this.previewButton = doc.createElement('button');
		this.previewButton.type = 'button';
		this.previewButton.className = 'wikiEditor-button';
		this.previewButton.textContent = this.msg('wikieditor-realtimepreview-preview');
		this.previewButton.setAttribute('aria-pressed', 'false');
		this.toolbar.element.append(this.previewButton);
		this.previewPane = doc.createElement('section');
		this.previewPane.className = 'wikiEditor-preview';
		this.previewPane.setAttribute('aria-label', this.msg('wikieditor-realtimepreview-preview'));
		this.previewPane.setAttribute('aria-live', 'polite');
		this.previewPane.hidden = true;
		this.element.append(this.previewPane);
		this.listen(this.previewButton, 'click', () => this.setPreviewEnabled(!this.previewEnabled));
	}

	setPreviewEnabled(enabled: boolean): void {
		this.assertActive();
		if (!this.previewPane || !this.previewButton)
			throw new Error('No renderPreview service was configured.');
		this.previewEnabled = enabled;
		this.previewPane.hidden = !enabled;
		this.previewButton.setAttribute('aria-pressed', String(enabled));
		this.previewRevision++;
		clearTimeout(this.previewTimer);
		this.previewRequest?.abort();
		this.setPreference('preview', enabled);
		if (enabled)
			void this.refreshPreview();
	}

	async refreshPreview(): Promise<void> {
		this.assertActive();
		const render = this.options.services?.renderPreview;
		if (!render || !this.previewPane || !this.previewEnabled)
			return;
		this.previewRequest?.abort();
		const request = new AbortController();
		this.previewRequest = request;
		const revision = ++this.previewRevision;
		this.previewPane.setAttribute('aria-busy', 'true');
		try {
			const html = await render(this.getValue(), {signal: request.signal, language: this.language});
			if (request.signal.aborted || this.destroyed || revision !== this.previewRevision)
				return;
			// This is the sole trusted HTML boundary; the host contract requires sanitization.
			this.previewPane.innerHTML = html;
		} catch (error) {
			if (!request.signal.aborted && !this.destroyed && revision === this.previewRevision) {
				this.previewPane.textContent = this.msg('wikieditor-realtimepreview-error');
				this.reportError(error);
			}
		} finally {
			if (!this.destroyed && revision === this.previewRevision)
				this.previewPane.removeAttribute('aria-busy');
		}
	}

	private createResizer(): void {
		const doc = this.textarea.ownerDocument;
		const bar = doc.createElement('div');
		bar.className = 'wikiEditor-resizer';
		bar.tabIndex = 0;
		bar.setAttribute('role', 'separator');
		bar.setAttribute('aria-orientation', 'horizontal');
		bar.setAttribute('aria-label', this.msg('wikieditor-toolbar'));
		this.element.append(bar);
		let pointer: number | undefined;
		let startY = 0;
		let height = 0;
		const resize = (next: number) => {
			const size = Math.max(100, Math.round(next));
			this.textarea.style.boxSizing = 'border-box';
			this.textarea.style.height = `${size}px`;
			bar.setAttribute('aria-valuenow', String(size));
		};
		this.listen(bar, 'pointerdown', (event) => {
			const e = event as PointerEvent;
			if (e.button !== 0)
				return;
			e.preventDefault();
			pointer = e.pointerId;
			startY = e.clientY;
			height = this.textarea.getBoundingClientRect().height;
			bar.setPointerCapture(pointer);
		});
		this.listen(bar, 'pointermove', (event) => {
			const e = event as PointerEvent;
			if (pointer === e.pointerId)
				resize(height + e.clientY - startY);
		});
		const stop = () => {
			if (pointer !== undefined) {
				if (bar.hasPointerCapture(pointer))
					bar.releasePointerCapture(pointer);
				pointer = undefined;
				this.setPreference('height', Math.round(this.textarea.getBoundingClientRect().height));
			}
		};
		this.listen(bar, 'pointerup', stop);
		this.listen(bar, 'pointercancel', stop);
		this.listen(bar, 'lostpointercapture', stop);
		this.listen(bar, 'keydown', (event) => {
			const e = event as KeyboardEvent;
			if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
				e.preventDefault();
				resize(this.textarea.getBoundingClientRect().height + (e.key === 'ArrowUp' ? -20 : 20));
				this.setPreference('height', Math.round(this.textarea.getBoundingClientRect().height));
			}
		});
		const savedHeight = this.preferences.height;
		if (typeof savedHeight === 'number' && Number.isFinite(savedHeight))
			resize(savedHeight);
	}

	/** Idempotent cleanup; retains edited value and returns the textarea to its current location. */
	destroy(): void {
		if (this.destroyed)
			return;
		clearTimeout(this.previewTimer);
		this.previewRequest?.abort();
		this.dialogs.destroy();
		this.toolbar.destroy();
		for (const remove of this.cleanup)
			remove();
		this.cleanup.length = 0;
		if (this.textarea.parentNode === this.element) {
			if (this.element.parentNode)
				this.element.parentNode.insertBefore(this.textarea, this.element);
			else
				this.element.removeChild(this.textarea);
		}
		this.textarea.className = this.originalClass;
		if (this.originalStyle === null)
			this.textarea.removeAttribute('style');
		else
			this.textarea.setAttribute('style', this.originalStyle);
		this.element.remove();
		activeEditors.delete(this.textarea);
		this.destroyed = true;
	}
}
