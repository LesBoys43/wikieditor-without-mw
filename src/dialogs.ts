import type {
	DialogName, EditorHost, FileInsertOptions, SearchOptions, SelectionRange, ServiceContext,
	TitleSuggestion
} from './types';

interface DialogState {
	root: HTMLDialogElement;
	form: HTMLFormElement;
	body: HTMLDivElement;
	footer: HTMLDivElement;
	error: HTMLParagraphElement;
	status: HTMLParagraphElement;
	selection: SelectionRange;
	selectionDirection: 'forward' | 'backward' | 'none';
	scrollTop: number;
	scrollLeft: number;
	previousFocus: HTMLElement | null;
	requests: Map<string, AbortController>;
	cleanup: (() => void)[];
	initialFocus: HTMLElement | null;
	nativeModal: boolean;
}

let nextDialogId = 0;

/** Native DOM dialogs. The host owns all text transformations and its own lifetime. */
export class DialogManager {
	private readonly host: EditorHost;
	private readonly document: Document;
	private active: DialogState | null = null;
	private destroyed = false;

	constructor(host: EditorHost) {
		this.host = host;
		this.document = host.textarea.ownerDocument;
	}

	open(name: DialogName): void {
		if (this.destroyed) {
			return;
		}
		this.close();
		const state = this.create(name);
		this.active = state;
		try {
			switch (name) {
				case 'link': this.link(state); break;
				case 'file': this.file(state); break;
				case 'table': this.table(state); break;
				case 'replace': this.replace(state); break;
			}
			this.host.element.append(state.root);
			// Older browsers still get a labelled, keyboard-accessible modal surface.
			if (typeof state.root.showModal === 'function') {
				try {
					state.root.showModal();
					state.nativeModal = true;
				} catch {
					state.root.setAttribute('open', '');
				}
			} else {
				state.root.setAttribute('open', '');
			}
			(state.initialFocus ?? state.root).focus();
		} catch (error: unknown) {
			this.close();
			this.host.reportError(error);
		}
	}

	/** Cancels requests and removes only this manager's DOM, never the host. */
	destroy(): void {
		if (this.destroyed) {
			return;
		}
		this.destroyed = true;
		this.close();
	}

	private message(key: string, ...params: (string | number)[]): string {
		return this.host.msg(key, ...params);
	}

	private create(name: DialogName): DialogState {
		const root = this.document.createElement('dialog');
		root.className = `wikiEditor-dialog wikiEditor-dialog-${name}`;
		root.dir = this.host.direction;
		root.lang = this.host.language;
		root.tabIndex = -1;
		root.setAttribute('role', 'dialog');
		root.setAttribute('aria-modal', 'true');
		const heading = this.document.createElement('h2');
		heading.className = 'wikiEditor-dialog-title';
		heading.id = `wikiEditor-dialog-title-${++nextDialogId}`;
		heading.textContent = this.message(`wikieditor-toolbar-tool-${name}-title`);
		root.setAttribute('aria-labelledby', heading.id);
		const form = this.document.createElement('form');
		form.className = 'wikiEditor-dialog-form';
		form.noValidate = true;
		const body = this.document.createElement('div');
		body.className = 'wikiEditor-dialog-body';
		const error = this.document.createElement('p');
		error.className = 'wikiEditor-error';
		error.id = `wikiEditor-dialog-error-${nextDialogId}`;
		error.setAttribute('role', 'alert');
		error.hidden = true;
		const status = this.document.createElement('p');
		status.className = 'wikiEditor-dialog-status';
		status.setAttribute('role', 'status');
		status.setAttribute('aria-live', 'polite');
		const footer = this.document.createElement('div');
		footer.className = 'wikiEditor-dialog-actions';
		form.append(body, error, status, footer);
		root.append(heading, form);
		const focused = this.document.activeElement;
		const state: DialogState = {
			root, form, body, footer, error, status,
			selection: this.host.getSelection(),
			selectionDirection: this.host.textarea.selectionDirection,
			scrollTop: this.host.textarea.scrollTop,
			scrollLeft: this.host.textarea.scrollLeft,
			previousFocus: focused && 'focus' in focused ? focused as HTMLElement : null,
			requests: new Map(), cleanup: [], initialFocus: null, nativeModal: false
		};
		root.addEventListener('cancel', (event) => {
			event.preventDefault();
			this.close();
		});
		root.addEventListener('close', () => {
			if (this.active === state) {
				this.close();
			}
		});
		root.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				this.close();
			} else if (event.key === 'Tab') {
				const items = Array.from(root.querySelectorAll<HTMLElement>(
					'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]'
				)).filter((item) => !item.hidden && item.getAttribute('type') !== 'hidden');
				const first = items[0];
				const last = items[items.length - 1];
				if (!first || !last) {
					event.preventDefault();
					root.focus();
				} else if (event.shiftKey && (this.document.activeElement === first || this.document.activeElement === root)) {
					event.preventDefault(); last.focus();
				} else if (!event.shiftKey && (this.document.activeElement === last || this.document.activeElement === root)) {
					event.preventDefault(); first.focus();
				}
			}
		});
		const containFocus = (event: FocusEvent): void => {
			if (this.active === state && !state.nativeModal && event.target && !root.contains(event.target as Node)) {
				(state.initialFocus ?? root).focus();
			}
		};
		this.document.addEventListener('focusin', containFocus);
		state.cleanup.push(() => this.document.removeEventListener('focusin', containFocus));
		return state;
	}

	private close(): void {
		const state = this.active;
		if (!state) {
			return;
		}
		// Invalidate first: even services ignoring AbortSignal cannot update a closed dialog.
		this.active = null;
		for (const controller of state.requests.values()) {
			controller.abort();
		}
		state.requests.clear();
		for (const cleanup of state.cleanup) {
			cleanup();
		}
		if (state.nativeModal && state.root.open) {
			state.root.close();
		}
		state.root.remove();
		this.restoreSelection(state);
		if (state.previousFocus?.isConnected) {
			state.previousFocus.focus({ preventScroll: true });
		} else if (this.host.textarea.isConnected) {
			this.host.focus();
		}
	}

	private restoreSelection(state: DialogState): void {
		this.host.setSelection(state.selection.start, state.selection.end);
		this.host.textarea.setSelectionRange(state.selection.start, state.selection.end, state.selectionDirection);
		this.host.textarea.scrollTop = state.scrollTop;
		this.host.textarea.scrollLeft = state.scrollLeft;
	}

	private rememberSelection(state: DialogState): void {
		state.selection = this.host.getSelection();
		state.selectionDirection = this.host.textarea.selectionDirection;
		state.scrollTop = this.host.textarea.scrollTop;
		state.scrollLeft = this.host.textarea.scrollLeft;
	}

	private field(state: DialogState, labelText: string, type = 'text', value = ''): HTMLInputElement {
		const input = this.document.createElement('input');
		input.type = type;
		input.value = value;
		input.className = 'wikiEditor-input';
		this.label(state, labelText, input);
		if (!state.initialFocus) {
			state.initialFocus = input;
		}
		return input;
	}

	private label(state: DialogState, text: string, control: HTMLElement): void {
		const label = this.document.createElement('label');
		label.className = 'wikiEditor-field';
		const caption = this.document.createElement('span');
		caption.textContent = text;
		label.append(caption, control);
		state.body.append(label);
	}

	private check(state: DialogState, key: string, checked = false): HTMLInputElement {
		const input = this.field(state, this.message(key), 'checkbox');
		input.checked = checked;
		return input;
	}

	private select<T extends string>(state: DialogState, label: string, choices: readonly (readonly [T, string])[], value: T): HTMLSelectElement {
		const select = this.document.createElement('select');
		select.className = 'wikiEditor-select';
		for (const [optionValue, text] of choices) {
			const option = this.document.createElement('option');
			option.value = optionValue;
			option.textContent = text;
			select.append(option);
		}
		select.value = value;
		this.label(state, label, select);
		return select;
	}

	private button(state: DialogState, key: string, action: () => void, primary = false, parent: HTMLElement = state.footer): HTMLButtonElement {
		const button = this.document.createElement('button');
		button.type = 'button';
		button.className = primary ? 'wikiEditor-button wikiEditor-primary' : 'wikiEditor-button';
		button.textContent = this.message(key);
		button.addEventListener('click', () => this.guard(state, action));
		parent.append(button);
		return button;
	}

	private submit(state: DialogState, insertKey: string, cancelKey: string, action: () => void): void {
		const primary = this.document.createElement('button');
		primary.type = 'submit';
		primary.className = 'wikiEditor-button wikiEditor-primary';
		primary.textContent = this.message(insertKey);
		state.footer.append(primary);
		// Let the form handle clicks and Enter exactly once.
		state.form.addEventListener('submit', (event) => {
			event.preventDefault();
			this.guard(state, action);
		});
		this.button(state, cancelKey, () => this.close());
	}

	private guard(state: DialogState, action: () => void): void {
		if (this.destroyed || this.active !== state) {
			return;
		}
		this.clearError(state);
		try {
			action();
		} catch (error: unknown) {
			this.fail(state, error);
		}
	}

	private clearError(state: DialogState): void {
		state.error.hidden = true;
		state.error.textContent = '';
		for (const field of state.body.querySelectorAll('[aria-invalid]')) {
			field.removeAttribute('aria-invalid');
			field.removeAttribute('aria-errormessage');
		}
	}

	private invalid(state: DialogState, text: string, field?: HTMLElement): void {
		state.error.textContent = text;
		state.error.hidden = false;
		if (field) {
			field.setAttribute('aria-invalid', 'true');
			field.setAttribute('aria-errormessage', state.error.id);
			field.focus();
		}
	}

	private fail(state: DialogState, error: unknown): void {
		this.invalid(state, error instanceof Error ? error.message : String(error));
		this.host.reportError(error);
	}

	private insert(state: DialogState, action: () => void): void {
		this.restoreSelection(state);
		action();
		this.rememberSelection(state);
		this.close();
	}

	private cancelRequest(state: DialogState, key: string): void {
		state.requests.get(key)?.abort();
		state.requests.delete(key);
	}

	private async request<T>(state: DialogState, key: string, service: (context: ServiceContext) => Promise<T>, apply: (value: T) => void): Promise<void> {
		this.cancelRequest(state, key);
		const controller = new AbortController();
		state.requests.set(key, controller);
		try {
			const result = await service({ signal: controller.signal, language: this.host.language });
			if (!this.destroyed && this.active === state && !controller.signal.aborted && state.requests.get(key) === controller) {
				apply(result);
			}
		} catch (error: unknown) {
			if (!this.destroyed && this.active === state && !controller.signal.aborted && state.requests.get(key) === controller) {
				this.fail(state, error);
			}
		} finally {
			if (state.requests.get(key) === controller) {
				state.requests.delete(key);
			}
		}
	}

	/** Services are optional: the same text field always permits manual entry. */
	private titles(state: DialogState, input: HTMLInputElement, enabled: () => boolean = () => true): void {
		const services = this.host.options.services;
		const list = this.document.createElement('datalist');
		list.id = `wikiEditor-titles-${nextDialogId}`;
		list.className = 'wikiEditor-title-suggestions';
		input.setAttribute('list', list.id);
		input.autocomplete = 'off';
		state.body.append(list);
		const update = (): void => {
			this.cancelRequest(state, 'search');
			this.cancelRequest(state, 'check');
			list.replaceChildren();
			state.status.textContent = '';
			const query = input.value.trim();
			if (!query || !enabled()) {
				return;
			}
			if (services?.searchTitles) {
				const search = services.searchTitles;
				void this.request(state, 'search', (context) => search(query, context), (suggestions) => {
					for (const suggestion of suggestions) {
						const option = this.document.createElement('option');
						option.value = suggestion.title;
						option.label = suggestion.description ?? suggestion.title;
						list.append(option);
					}
				});
			}
		};
		input.addEventListener('input', update);
		input.addEventListener('change', () => {
			this.cancelRequest(state, 'check');
			state.status.textContent = '';
			const title = input.value.trim();
			if (title && enabled() && services?.checkTitle) {
				const check = services.checkTitle;
				void this.request(state, 'check', (context) => check(title, context), (result: TitleSuggestion) => {
					const key = result.disambiguation ? 'disambig' : result.exists === true ? 'exists' : result.exists === false ? 'notexists' : null;
					state.status.textContent = key ? this.message(`wikieditor-toolbar-tool-link-int-target-status-${key}`) : '';
				});
			}
		});
		update();
	}

	private link(state: DialogState): void {
		const mode = this.select(state, this.message('wikieditor-toolbar-tool-link'), [
			['internal', this.message('wikieditor-toolbar-tool-link-int')],
			['external', this.message('wikieditor-toolbar-tool-link-ext')]
		] as const, 'internal');
		const target = this.field(state, this.message('wikieditor-toolbar-tool-link-int-target'));
		target.title = this.message('wikieditor-toolbar-tool-link-int-target-tooltip');
		const text = this.field(state, this.message('wikieditor-toolbar-tool-link-int-text'), 'text', this.host.getSelectedText());
		text.title = this.message('wikieditor-toolbar-tool-link-int-text-tooltip');
		this.titles(state, target, () => mode.value === 'internal');
		mode.addEventListener('change', () => {
			const external = mode.value === 'external';
			const targetCaption = target.parentElement?.querySelector('span');
			const textCaption = text.parentElement?.querySelector('span');
			if (targetCaption) {
				targetCaption.textContent = this.message(external ? 'wikieditor-toolbar-tool-link-ext-target' : 'wikieditor-toolbar-tool-link-int-target');
			}
			if (textCaption) {
				textCaption.textContent = this.message(external ? 'wikieditor-toolbar-tool-link-ext-text' : 'wikieditor-toolbar-tool-link-int-text');
			}
			target.dispatchEvent(new Event('input'));
		});
		this.submit(state, 'wikieditor-toolbar-tool-link-insert', 'wikieditor-toolbar-tool-link-cancel', () => {
			if (!target.value.trim()) {
				this.invalid(state, this.message('wikieditor-toolbar-tool-link-int-target-status-invalid'), target);
				return;
			}
			this.insert(state, () => this.host.insertLink(target.value.trim(), text.value, mode.value === 'external'));
		});
	}

	private file(state: DialogState): void {
		const title = this.field(state, this.message('wikieditor-toolbar-file-target'));
		this.titles(state, title);
		const caption = this.field(state, this.message('wikieditor-toolbar-file-caption'), 'text', this.host.getSelectedText());
		const alt = this.field(state, this.message('wikieditor-toolbar-file-alt'));
		const help = this.document.createElement('p');
		help.className = 'wikiEditor-field-help';
		help.id = `wikiEditor-alt-help-${nextDialogId}`;
		help.textContent = this.message('wikieditor-toolbar-file-alt-help');
		alt.setAttribute('aria-describedby', help.id);
		state.body.append(help);
		const size = this.field(state, this.message('wikieditor-toolbar-file-size'), 'number');
		size.min = '1'; size.step = '1';
		const words = this.host.magicWords;
		const align = this.select(state, this.message('wikieditor-toolbar-file-float'), [
			['', this.message('wikieditor-toolbar-file-default')],
			['left', words.left], ['center', words.center], ['right', words.right], ['none', words.none]
		] as const, '');
		const format = this.select(state, this.message('wikieditor-toolbar-file-format'), [
			['thumbnail', words.thumbnail], ['frame', words.frame], ['frameless', words.frameless],
			['none', this.message('wikieditor-toolbar-file-format-none')]
		] as const, 'thumbnail');
		const upload = this.host.options.services?.uploadFile;
		if (upload) {
			const picker = this.field(state, this.message('wikieditor-toolbar-tool-file-upload'), 'file');
			this.button(state, 'wikieditor-toolbar-tool-file-upload', () => {
				const selected = picker.files?.[0];
				if (!selected) {
					this.invalid(state, 'Choose a file to upload.', picker);
					return;
				}
				// Repeated uploads supersede the previous request rather than blocking editing.
				void this.request(state, 'upload', (context) => upload(selected, context), (result) => {
					if (!result.title.trim()) {
						throw new Error('The upload service returned an empty file title.');
					}
					title.value = result.title;
					title.dispatchEvent(new Event('input'));
				});
			}, false, state.body);
			const cancelUpload = (): void => {
				this.cancelRequest(state, 'upload');
			};
			title.addEventListener('input', cancelUpload);
			picker.addEventListener('change', cancelUpload);
		}
		this.submit(state, 'wikieditor-toolbar-tool-file-insert', 'wikieditor-toolbar-tool-file-cancel', () => {
			if (!title.value.trim()) {
				this.invalid(state, 'Enter a filename.', title);
				return;
			}
			const parsedSize = Number(size.value);
			if (size.value && (!/^\d+$/.test(size.value) || !Number.isSafeInteger(parsedSize) || parsedSize < 1)) {
				this.invalid(state, 'Size must be a positive integer.', size);
				return;
			}
			const options: FileInsertOptions = {
				title: title.value.trim(), caption: caption.value, alt: alt.value,
				format: format.value as NonNullable<FileInsertOptions['format']>
			};
			if (size.value) { options.size = parsedSize; }
			if (align.value) { options.align = align.value as NonNullable<FileInsertOptions['align']>; }
			this.insert(state, () => this.host.insertFile(options));
		});
	}

	private table(state: DialogState): void {
		const rows = this.field(state, this.message('wikieditor-toolbar-tool-table-dimensions-rows'), 'number', '3');
		const columns = this.field(state, this.message('wikieditor-toolbar-tool-table-dimensions-columns'), 'number', '3');
		for (const input of [rows, columns]) {
			input.min = '1'; input.step = '1';
		}
		const header = this.check(state, 'wikieditor-toolbar-tool-table-dimensions-header', true);
		const wikitable = this.check(state, 'wikieditor-toolbar-tool-table-wikitable', true);
		const sortable = this.check(state, 'wikieditor-toolbar-tool-table-sortable');
		const caption = this.field(state, this.message('wikieditor-toolbar-file-caption'));
		this.submit(state, 'wikieditor-toolbar-tool-table-insert', 'wikieditor-toolbar-tool-table-cancel', () => {
			const rowCount = Number(rows.value);
			const columnCount = Number(columns.value);
			for (const input of [rows, columns]) {
				if (!/^\d+$/.test(input.value) || !Number.isSafeInteger(Number(input.value))) {
					this.invalid(state, this.message('wikieditor-toolbar-tool-table-invalidnumber'), input);
					return;
				}
				if (Number(input.value) < 1) {
					this.invalid(state, this.message('wikieditor-toolbar-tool-table-zero'), input);
					return;
				}
			}
			// Match the public insertion API, counting the optional header row as well.
			const limit = this.host.options.maxTableCells ?? 10000;
			if (!Number.isSafeInteger(limit) || limit < 1) {
				throw new Error('maxTableCells must be a positive safe integer.');
			}
			if (rowCount + (header.checked ? 1 : 0) > Math.floor(limit / columnCount)) {
				this.invalid(state, this.message('wikieditor-toolbar-tool-table-toomany', limit), rows);
				return;
			}
			this.insert(state, () => this.host.insertTable({
				rows: rowCount, columns: columnCount, header: header.checked,
				wikitable: wikitable.checked, sortable: sortable.checked, caption: caption.value
			}));
		});
	}

	private replace(state: DialogState): void {
		const search = this.field(state, this.message('wikieditor-toolbar-tool-replace-search'), 'text', this.host.getSelectedText());
		const replacement = this.field(state, this.message('wikieditor-toolbar-tool-replace-replace'));
		const caseSensitive = this.check(state, 'wikieditor-toolbar-tool-replace-case');
		const regex = this.check(state, 'wikieditor-toolbar-tool-replace-regex');
		const wholeWord = this.check(state, 'wikieditor-toolbar-tool-replace-word');
		const run = (action: 'find' | 'replace' | 'all'): void => {
			state.status.textContent = '';
			if (!search.value) {
				this.invalid(state, this.message('wikieditor-toolbar-tool-replace-emptysearch'), search);
				return;
			}
			if (regex.checked) {
				try {
					new RegExp(search.value, caseSensitive.checked ? 'g' : 'gi');
				} catch (error: unknown) {
					this.invalid(state, this.message('wikieditor-toolbar-tool-replace-invalidregex', error instanceof Error ? error.message : String(error)), search);
					this.host.reportError(error);
					return;
				}
			}
			const options: SearchOptions = { caseSensitive: caseSensitive.checked, regex: regex.checked, wholeWord: wholeWord.checked };
			this.restoreSelection(state);
			let count: number;
			if (action === 'find') {
				count = this.host.findNext(search.value, options) ? 1 : 0;
			} else if (action === 'replace') {
				count = this.host.replaceSelection(search.value, replacement.value, options) ? 1 : 0;
			} else {
				count = this.host.replaceAll(search.value, replacement.value, options);
			}
			// Subsequent actions operate on the latest match rather than the opening selection.
			this.rememberSelection(state);
			if (!count) {
				this.invalid(state, this.message('wikieditor-toolbar-tool-replace-nomatch'));
			} else if (action !== 'find') {
				state.status.textContent = this.message('wikieditor-toolbar-tool-replace-success', count);
			}
		};
		this.button(state, 'wikieditor-toolbar-tool-replace-button-findnext', () => run('find'), true);
		this.button(state, 'wikieditor-toolbar-tool-replace-button-replace', () => run('replace'));
		this.button(state, 'wikieditor-toolbar-tool-replace-button-replaceall', () => run('all'));
		this.button(state, 'wikieditor-toolbar-tool-replace-close', () => this.close());
		state.form.addEventListener('submit', (event) => {
			event.preventDefault();
			this.guard(state, () => run('find'));
		});
	}
}
