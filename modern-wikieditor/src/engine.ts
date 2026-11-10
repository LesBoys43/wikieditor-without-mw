/**
 * Native editing commands adapted from this repository's src/WikiEditor.ts.
 * SPDX-License-Identifier: GPL-2.0-or-later
 * UI, preview rendering and service cancellation belong to the Vue component.
 */
import {MessageCatalog} from './messages';
import {TextSelection} from './text';
import type {
	DialogName, EditorHost, EncapsulateOptions, FileInsertOptions, MagicWords,
	PanelName, PreferenceValue, SearchOptions, SelectionRange, TableInsertOptions,
	ToolDefinition, WikiEditorOptions,
} from './types';

/** Delegate UI state changes without creating or owning any UI nodes. */
export interface EditorHooks {
	openDialog(name: DialogName): void;
	togglePanel(name: PanelName): void;
	addTool(tool: ToolDefinition): void;
	removeTool(id: string): void;
}

const activeEditors = new WeakSet<HTMLTextAreaElement>();

/** DOM-light editing host; the supplied textarea and wrapper remain Vue-owned. */
export class WikiEditorEngine implements EditorHost {
	public readonly textarea: HTMLTextAreaElement;

	public readonly element: HTMLElement;

	public readonly options: WikiEditorOptions;

	public readonly language: string;

	public readonly direction: 'ltr' | 'rtl';

	public readonly magicWords: MagicWords;

	private readonly catalog: MessageCatalog;

	private readonly selection: TextSelection;

	private readonly preferences: Record<string, PreferenceValue>;

	private destroyed = false;

	private readonly inputListener = (): void => this.changed();

	public constructor(
		textarea: HTMLTextAreaElement,
		element: HTMLElement,
		options: WikiEditorOptions,
		private readonly hooks: EditorHooks,
	) {
		if (!textarea || textarea.tagName !== 'TEXTAREA')
			throw new TypeError('WikiEditor requires a textarea element.');
		if (!element || element.ownerDocument !== textarea.ownerDocument)
			throw new TypeError('WikiEditor requires a wrapper in the same document.');
		if (activeEditors.has(textarea))
			throw new Error('This textarea already has a WikiEditor engine.');
		this.textarea = textarea;
		this.element = element;
		this.options = {...options};
		this.language = options.language || 'en';
		this.direction = options.direction || (/^(ar|arc|ary|arz|azb|bcc|bgn|ckb|fa|he|ks|lki|lrc|mzn|nqo|pnb|ps|sd|sdh|skr-arab|ug|ur|yi)(-|$)/i.test(this.language) ? 'rtl' : 'ltr');
		this.magicWords = {
			redirect: '#REDIRECT',
			thumbnail: 'thumb',
			left: 'left',
			center: 'center',
			right: 'right',
			none: 'none',
			frame: 'frame',
			frameless: 'frameless',
			alt: 'alt',
			...options.magicWords,
		};
		this.catalog = new MessageCatalog(this.language, options);
		this.selection = new TextSelection(textarea);
		this.preferences = {};
		for (const [key, value] of Object.entries(options.preferences || {}))
			this.preferences[key] = Array.isArray(value) ? value.slice() : value;
		textarea.addEventListener('input', this.inputListener);
		activeEditors.add(textarea);
	}

	public assertActive(): void {
		if (this.destroyed)
			throw new Error('WikiEditor has been destroyed.');
	}

	private editable(): boolean {
		this.assertActive();
		return !this.textarea.disabled && !this.textarea.readOnly;
	}

	public msg(key: string, ...params: (string | number)[]): string {
		this.assertActive();
		return this.catalog.get(key, ...params);
	}

	public getValue(): string {
		this.assertActive();
		return this.textarea.value;
	}

	/**
	 * Programmatic value synchronization remains allowed on read-only controls.
	 *
	 * @param {string} value New textarea content.
	 */
	public setValue(value: string): void {
		this.assertActive();
		if (this.textarea.value === value)
			return;
		this.textarea.value = value;
		this.emitInput();
	}

	public getSelection(): SelectionRange {
		this.assertActive();
		return this.selection.get();
	}

	public setSelection(start: number, end = start): void {
		this.assertActive();
		this.selection.set(start, end);
	}

	public getSelectedText(): string {
		const {start, end} = this.getSelection();
		return this.getValue().slice(start, end);
	}

	public focus(): void {
		this.assertActive();
		this.textarea.focus({preventScroll: true});
	}

	public insertText(text: string): void {
		if (!this.editable())
			return;
		this.selection.replace(text);
		this.focus();
		this.emitInput();
	}

	public encapsulate(options: EncapsulateOptions): void {
		if (!this.editable())
			return;
		const pre = options.pre || '';
		const post = options.post || '';
		let {start, end} = this.getSelection();
		const value = this.getValue();
		if (options.ownline) {
			start = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
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
			} else
				output = pre + middle + post;

		} else
			output = options.splitlines ? middle.split('\n').map((line) => pre + line + post).join('\n') : pre + middle + post;

		this.selection.set(start, end);
		this.selection.replace(output, true);
		if (!selected && middle && !options.splitlines)
			this.selection.set(start + pre.length, start + pre.length + middle.length);
		this.focus();
		this.emitInput();
	}

	public insertLink(target: string, label = '', external = false): void {
		this.assertActive();
		const title = target.trim();
		if (!title || /[\n\r[\]<>|]/.test(title) || /[\n\r[\]<>|]/.test(label))
			throw new Error('Invalid link target or label.');
		if (external) {
			const protocols = this.options.allowedProtocols || [
				'https:',
				'http:',
				'mailto:',
				'ftp:',
				'//',
			];
			const allowed = protocols.some((protocol) =>
				title.toLowerCase().startsWith(protocol.toLowerCase()));
			if (!allowed)
				throw new Error('The external link protocol is not allowed.');
			this.insertText(`[${title}${label ? ` ${label}` : ''}]`);
		} else
			this.insertText(`[[${title}${label && label !== title ? `|${label}` : ''}]]`);

	}

	public insertFile(options: FileInsertOptions): void {
		this.assertActive();
		const namespace = this.options.fileNamespace || 'File';
		let title = options.title.trim();
		if (title.toLowerCase().startsWith(`${namespace.toLowerCase()}:`))
			title = title.slice(namespace.length + 1);
		if (!title || /[\n\r[\]<>|]/.test(title))
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
			if (/[\n\r|[\]]/.test(options.alt))
				throw new Error('Alternative text cannot contain Wikitext delimiters.');
			parts.push(`${this.magicWords.alt}=${options.alt}`);
		}
		if (options.caption)
			parts.push(options.caption);
		this.insertText(`[[${parts.join('|')}]]`);
	}

	public insertTable(options: TableInsertOptions): void {
		this.assertActive();
		const {rows, columns} = options;
		if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns) ||
			rows < 1 || columns < 1)
			throw new Error(this.msg('wikieditor-toolbar-tool-table-invalidnumber'));
		const limit = this.options.maxTableCells ?? 10000;
		if (!Number.isSafeInteger(limit) || limit < 1)
			throw new Error('maxTableCells must be a positive safe integer.');
		if (rows * columns + (options.header ? columns : 0) > limit)
			throw new Error(this.msg('wikieditor-toolbar-tool-table-toomany', limit));
		const classes = [options.wikitable ? 'wikitable' : '', options.sortable ? 'sortable' : ''].filter(Boolean);
		const lines = [classes.length ? `{| class="${classes.join(' ')}"` : '{|'];
		if (options.caption)
			lines.push(`|+ ${options.caption}`);
		if (options.header)
			lines.push(`! ${Array.from({length: columns}, () => this.msg('wikieditor-toolbar-tool-table-example-header')).join(' !! ')}`);
		for (let row = 0; row < rows; row++) {
			lines.push('|-');
			lines.push(`| ${Array.from({length: columns}, () => this.msg('wikieditor-toolbar-tool-table-example-cell-text')).join(' || ')}`);
		}
		lines.push('|}');
		const {start, end} = this.getSelection();
		const value = this.getValue();
		this.insertText(`${start && value[start - 1] !== '\n' ? '\n' : ''}${lines.join('\n')}${end < value.length && value[end] !== '\n' ? '\n' : ''}`);
	}

	public findNext(search: string, options: SearchOptions = {}): SelectionRange | null {
		this.assertActive();
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

	public replaceSelection(
		search: string, replacement: string, options: SearchOptions = {},
	): boolean {
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
		if (options.regex)
			// Expand captures using the full input, including lookaround context.
			text = this.expandReplacement(replacement, match, value);

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

	public replaceAll(search: string, replacement: string, options: SearchOptions = {}): number {
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

	public openDialog(name: DialogName): void {
		if (this.editable())
			this.hooks.openDialog(name);
	}

	public togglePanel(name: PanelName): void {
		this.assertActive();
		this.hooks.togglePanel(name);
	}

	public addTool(tool: ToolDefinition): void {
		this.assertActive();
		this.hooks.addTool(tool);
	}

	public removeTool(id: string): void {
		this.assertActive();
		this.hooks.removeTool(id);
	}

	public getPreference(key: string): PreferenceValue | undefined {
		this.assertActive();
		const value = this.preferences[key];
		return Array.isArray(value) ? value.slice() : value;
	}

	public setPreference(key: string, value: PreferenceValue): void {
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
		else {
			// Documents without a window still support native bubbling events.
			const event = this.textarea.ownerDocument.createEvent('Event');
			event.initEvent('input', true, false);
			this.textarea.dispatchEvent(event);
		}
	}

	private changed(): void {
		if (this.destroyed)
			return;
		try {
			this.options.onChange?.(this.textarea.value);
		} catch (error) {
			this.reportError(error);
		}
	}

	public reportError(error: unknown): void {
		const problem = error instanceof Error ? error : new Error(String(error));
		if (this.options.onError)
			try {
				this.options.onError(problem);
			} catch {
				// User error handlers must not break cleanup or event delivery.
			}

	}

	/** Idempotently release listeners; never remove or restyle Vue-owned nodes. */
	public destroy(): void {
		if (this.destroyed)
			return;
		this.destroyed = true;
		this.textarea.removeEventListener('input', this.inputListener);
		activeEditors.delete(this.textarea);
	}
}
