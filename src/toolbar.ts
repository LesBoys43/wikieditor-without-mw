import type {CharacterGroup, EditorHost, EncapsulateOptions, PanelName, ToolDefinition} from './types';

// A deliberately small local palette, not MediaWiki's complete special-character data.
const LOCAL_CHARACTERS: readonly CharacterGroup[] = [
	{id: 'common', label: 'Common symbols (local selection)', characters: Array.from('—–…“”‘’«»‹›•·©®™§¶†‡°′″№')},
	{id: 'math', label: 'Mathematics (local selection)', characters: Array.from('±−×÷≈≠≤≥∞√∑∏∫∂∆∇∈∉⊂⊆∪∩∅∀∃¬∧∨')},
	{id: 'latin', label: 'Latin accents (local selection)', characters: Array.from('ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØŒÙÚÛÜÝßàáâãäåæçèéêëìíîïñòóôõöøœùúûüýÿ')},
	{id: 'greek', label: 'Greek (local selection)', characters: Array.from('ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψωςω')},
	{id: 'arrows', label: 'Arrows and currency (local selection)', characters: Array.from('←↑→↓↔↕⇐⇒⇔↗↘↙↖€£¥¢¤₩₹₽')},
];

type ToolEntry = { definition: ToolDefinition; button: HTMLButtonElement };
type SavedSelection = { start: number; end: number; direction: 'forward' | 'backward' | 'none' };

/** Native-DOM interpretation of the official 2010 toolbar's tool groups and messages. */
export class Toolbar {
	public readonly element: HTMLElement;

	private readonly document: Document;

	private readonly main: HTMLElement;

	private readonly panels = new Map<PanelName, HTMLElement>();

	private readonly toggles = new Map<PanelName, HTMLButtonElement>();

	private readonly groups = new Map<string, HTMLElement>();

	private readonly tools = new Map<string, ToolEntry>();

	private readonly cleanups: (() => void)[] = [];

	private selection: SavedSelection;

	private activePanel: PanelName | null = null;

	private destroyed = false;

	public constructor(private readonly host: EditorHost) {
		this.document = host.textarea.ownerDocument;
		this.selection = this.readSelection();
		this.element = this.node('div', 'wikiEditor-toolbar');
		this.element.dir = host.direction;
		this.element.setAttribute('aria-label', host.msg('wikieditor-toolbar'));
		const top = this.node('div', 'wikiEditor-toolbar-top');
		this.main = this.node('div', 'wikiEditor-main');
		this.main.setAttribute('role', 'toolbar');
		this.main.setAttribute('aria-label', host.msg('wikieditor-toolbar'));
		const tabs = this.node('div', 'wikiEditor-tabs');
		tabs.setAttribute('role', 'group');
		for (const name of [
			'advanced',
			'characters',
			'help',
		] as const) {
			const label = host.msg(`wikieditor-toolbar-section-${name}`);
			const toggle = this.button(label, 'wikiEditor-tab');
			toggle.dataset.panel = name;
			toggle.setAttribute('aria-expanded', 'false');
			const panel = this.node('div', `wikiEditor-panel wikiEditor-panel-${name}`);
			panel.hidden = true;
			panel.setAttribute('role', 'region');
			panel.setAttribute('aria-label', label);
			this.toggles.set(name, toggle);
			this.panels.set(name, panel);
			tabs.append(toggle);
		}
		top.append(this.main, tabs);
		this.element.append(top, ...this.panels.values());
		this.buildTools();
		this.buildCharacters();
		this.buildHelp();
		for (const tool of host.options.tools ?? []) this.addTool(tool);

		// Remember selection before focus moves into selects or keyboard-accessible controls.
		for (const event of [
			'select',
			'keyup',
			'mouseup',
			'input',
			'blur',
		])
			this.listen(host.textarea, event, () => {
				this.selection = this.readSelection();
			});

		this.listen(this.element, 'mousedown', (event) => {
			const mouse = event as MouseEvent;
			if (mouse.button === 0 && this.closest(mouse.target, 'button')) mouse.preventDefault();
		});
		this.listen(this.element, 'click', (event) => this.onClick(event));
		this.listen(this.element, 'keydown', (event) => this.onKeydown(event as KeyboardEvent));
		this.listen(host.textarea, 'keydown', (event) => this.onHotkey(event as KeyboardEvent));
	}

	public addTool(tool: ToolDefinition): void {
		if (this.destroyed) return;
		this.removeTool(tool.id);
		const button = this.button(tool.label, 'wikiEditor-tool');
		button.dataset.tool = tool.id;
		button.title = tool.hotkey ? `${tool.label} (Ctrl/⌘+${tool.hotkey})` : tool.label;
		button.setAttribute('aria-label', tool.label);
		const symbol = this.node('span', 'wikiEditor-tool-symbol', tool.icon ?? tool.label);
		symbol.setAttribute('aria-hidden', 'true');
		button.append(symbol);
		this.tools.set(tool.id, {definition: tool, button});
		this.group(tool.section ?? 'main', tool.group ?? 'custom').append(button);
	}

	public removeTool(id: string): void {
		const entry = this.tools.get(id);
		if (!entry) return;
		const parent = entry.button.parentElement;
		entry.button.remove();
		this.tools.delete(id);
		if (parent && !parent.querySelector('button, select')) {
			parent.remove();
			for (const [key, value] of this.groups) if (value === parent) this.groups.delete(key);
		}
	}

	public togglePanel(name: PanelName): void {
		if (this.destroyed) return;
		const next = this.activePanel === name ? null : name;
		for (const [key, panel] of this.panels) {
			// If a programmatic close hides the focused control, return focus to its disclosure.
			if (key !== next && panel.contains(this.document.activeElement))
				this.toggles.get(key)?.focus();
			panel.hidden = key !== next;
			this.toggles.get(key)?.setAttribute('aria-expanded', String(key === next));
		}
		this.activePanel = next;
	}

	public destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		for (const cleanup of this.cleanups.splice(0)) cleanup();
		this.tools.clear();
		this.groups.clear();
		this.panels.clear();
		this.toggles.clear();
		this.element.remove();
	}

	private node<K extends keyof HTMLElementTagNameMap>(
		tag: K, className?: string, text?: string,
	): HTMLElementTagNameMap[K] {
		const element = this.document.createElement(tag);
		if (className) element.className = className;
		if (text !== undefined) element.textContent = text;
		return element;
	}

	private button(label: string, className: string): HTMLButtonElement {
		const button = this.node('button', className);
		button.type = 'button';
		button.textContent = className === 'wikiEditor-tool' ? '' : label;
		return button;
	}

	private listen(target: EventTarget, type: string, listener: EventListener): void {
		target.addEventListener(type, listener);
		this.cleanups.push(() => target.removeEventListener(type, listener));
	}

	private closest(target: EventTarget | null, selector: string): HTMLElement | null {
		// Avoid realm-sensitive instanceof checks when the textarea lives in another document.
		const element = target as HTMLElement | null;
		const match = element?.closest?.(selector) as HTMLElement | null;
		return match && this.element.contains(match) ? match : null;
	}

	private group(section: 'main' | 'advanced', name: string): HTMLElement {
		const key = `${section}:${name}`;
		let group = this.groups.get(key);
		if (!group) {
			group = this.node('div', 'wikiEditor-tool-group');
			group.dataset.group = name;
			group.setAttribute('role', 'group');
			if (name === 'format' || name === 'insert') group.setAttribute('aria-label', this.host.msg(`wikieditor-toolbar-group-${name}`));
			(section === 'main' ? this.main : this.panels.get('advanced'))?.append(group);
			this.groups.set(key, group);
		}
		return group;
	}

	private buildTools(): void {
		const msg = (id: string): string => this.host.msg(`wikieditor-toolbar-tool-${id}`);
		const wrap = (id: string, pre: string, post = '', extra: EncapsulateOptions = {}) =>
			(host: EditorHost) => host.encapsulate({pre, post, peri: msg(`${id}-example`), ...extra});
		const add = (
			id: string, icon: string, action: ToolDefinition['action'],
			section?: 'main' | 'advanced', group?: string, hotkey?: string,
		): void => this.addTool({
			id,
			label: msg(id),
			icon,
			action,
			section: section ?? 'main',
			group: group ?? 'format',
			hotkey,
		});
		add('bold', 'B', wrap('bold', "'''", "'''"), 'main', 'format', 'b');
		add('italic', 'I', wrap('italic', "''", "''"), 'main', 'format', 'i');
		add('link', '🔗', (host) => host.openDialog('link'), 'main', 'insert');
		add('file', '▧', (host) => host.openDialog('file'), 'main', 'insert');
		add('signature', '✎', (host) => host.encapsulate({pre: host.options.signature ?? '--~~~~'}), 'main', 'insert');

		const heading = this.node('select', 'wikiEditor-heading');
		heading.setAttribute('aria-label', msg('heading'));
		heading.append(this.node('option', '', msg('heading')));
		heading.options[0].value = '';
		// Official configuration offers heading levels 2–5, not a page-title level 1.
		for (let level = 2; level <= 5; level++) {
			const option = this.node('option', '', msg(`heading-${level}`));
			option.value = String(level);
			heading.append(option);
		}
		this.group('advanced', 'heading').append(heading);
		this.listen(heading, 'change', () => {
			const level = Number(heading.value);
			if (level < 2 || level > 5) return;
			const marks = '='.repeat(level);
			this.run(() => this.host.encapsulate({
				pre: `${marks} `,
				post: ` ${marks}`,
				peri: msg('heading-example'),
				ownline: true,
				regex: /^(\s*)(={1,6})(.*?)\2(\s*)$/,
				regexReplace: `$1${marks}$3${marks}$4`,
			}));
			heading.value = '';
		});
		const listTools = [{id: 'ulist', marker: '*', icon: '• ≡'}, {id: 'olist', marker: '#', icon: '1. ≡'}];
		for (const {id, marker, icon} of listTools)
			add(id, icon, wrap(id, `${marker} `, '', {
				ownline: true,
				splitlines: true,
				regex: /^([*#:;]*)\s*(.*)$/gm,
				regexReplace: `$1${marker} $2`,
			}), 'advanced');

		add('code', '<>', wrap('code', '<code>', '</code>'), 'advanced');
		add('nowiki', 'W̸', wrap('nowiki', '<nowiki>', '</nowiki>'), 'advanced', 'format', '\\');
		add('newline', '↵', (host) => host.encapsulate({pre: '<br>\n'}), 'advanced');
		const sizeTools = [
			{id: 'big', tag: 'big', icon: 'A↑', hotkey: undefined},
			{id: 'small', tag: 'small', icon: 'A↓', hotkey: undefined},
			{id: 'superscript', tag: 'sup', icon: 'x²', hotkey: '.'},
			{id: 'subscript', tag: 'sub', icon: 'x₂', hotkey: ','},
		];
		for (const {id, tag, icon, hotkey} of sizeTools)
			add(id, icon, wrap(id, `<${tag}>`, `</${tag}>`), 'advanced', 'size', hotkey);

		add('gallery', '▧▧', wrap('gallery', '<gallery>\n', '\n</gallery>', {ownline: true}), 'advanced', 'insert');
		add('redirect', '↪', wrap('redirect', `${this.host.magicWords.redirect} [[`, ']]', {ownline: true}), 'advanced', 'insert');
		add('table', '▦', (host) => host.openDialog('table'), 'advanced', 'insert');
		add('replace', '⌕', (host) => host.openDialog('replace'), 'advanced', 'search');
	}

	private buildCharacters(): void {
		const panel = this.panels.get('characters')!;
		const groups = this.host.options.characterGroups ?? LOCAL_CHARACTERS;
		const pages = groups.map((group) => {
			const content = this.node('div', 'wikiEditor-character-grid');
			for (const character of group.characters) {
				const button = this.button(character, 'wikiEditor-character');
				button.dataset.character = character;
				button.title = character;
				content.append(button);
			}
			return {label: group.label, content};
		});
		this.booklet(panel, pages);
	}

	private booklet(panel: HTMLElement, pages: { label: string; content: HTMLElement }[]): void {
		const nav = this.node('div', 'wikiEditor-booklet-nav');
		nav.setAttribute('role', 'group');
		nav.setAttribute('aria-label', panel.getAttribute('aria-label') ?? '');
		const body = this.node('div', 'wikiEditor-booklet-body');
		const buttons: HTMLButtonElement[] = [];
		pages.forEach((page, index) => {
			const button = this.button(page.label, 'wikiEditor-booklet-page');
			button.setAttribute('aria-pressed', String(index === 0));
			page.content.hidden = index !== 0;
			page.content.setAttribute('aria-label', page.label);
			page.content.setAttribute('role', 'group');
			buttons.push(button);
			this.listen(button, 'click', () => {
				pages.forEach((other, otherIndex) => {
					other.content.hidden = index !== otherIndex;
					buttons[otherIndex]?.setAttribute('aria-pressed', String(index === otherIndex));
				});
			});
			nav.append(button);
			body.append(page.content);
		});
		panel.append(nav, body);
	}

	private buildHelp(): void {
		const msg = (id: string, ...params: (string | number)[]): string =>
			this.host.msg(`wikieditor-toolbar-help-${id}`, ...params);
		type Row = { id: string; syntax: string; result: HTMLElement };
		const textResult = (
			text: string, tag: keyof HTMLElementTagNameMap = 'span',
		): HTMLElement => this.node(tag, '', text);
		const pages: { label: string; content: HTMLElement }[] = [];
		const page = (name: string, rows: Row[]): void => {
			const table = this.node('table', 'wikiEditor-help-table');
			const head = this.node('thead');
			const tr = this.node('tr');
			for (const key of [
				'description',
				'syntax',
				'result',
			]) {
				const th = this.node('th', '', msg(`heading-${key}`));
				th.scope = 'col';
				tr.append(th);
			}
			head.append(tr);
			const body = this.node('tbody');
			for (const row of rows) {
				const line = this.node('tr');
				const description = this.node('th', '', msg(`content-${row.id}-description`));
				description.scope = 'row';
				const syntax = this.node('td');
				syntax.append(this.node('code', '', row.syntax));
				const result = this.node('td');
				result.append(row.result);
				line.append(description, syntax, result);
				body.append(line);
			}
			table.append(head, body);
			const content = this.node('div', 'wikiEditor-help-page');
			content.append(table);
			pages.push({label: msg(`page-${name}`), content});
		};
		page('format', ([
			'italic',
			'bold',
			'bolditalic',
		] as const).map((id, index) => {
			const example = msg(`content-${id}-example`);
			const marks = "'".repeat([
				2,
				3,
				5,
			][index]);
			const result = textResult(example, index === 0 ? 'em' : 'strong');
			if (id === 'bolditalic') result.replaceChildren(textResult(example, 'em'));
			return {id, syntax: marks + example + marks, result};
		}));
		const url = msg('content-xlink-example-url');
		const label = msg('content-xlink-example-label');
		// Local inert examples: neither translated wikitext nor message HTML is executed.
		const internal = msg('content-ilink-example');
		page('link', [{id: 'ilink', syntax: internal, result: textResult(internal.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1'))}, {id: 'xlink', syntax: msg('content-xlink-example1', url, label), result: textResult(`${label}\n[1]\n${url}`)}]);
		page('heading', [
			2,
			3,
			4,
			5,
		].map((level) => {
			const example = msg(`content-heading${level}-example`);
			const marks = '='.repeat(level);
			return {id: `heading${level}`, syntax: `${marks} ${example} ${marks}`, result: textResult(example, `h${level}` as 'h2' | 'h3' | 'h4' | 'h5')};
		}));
		page('list', (['ulist', 'olist'] as const).map((id) => {
			const example = msg(`content-${id}-example`);
			const marker = id === 'ulist' ? '*' : '#';
			const result = this.node(id === 'ulist' ? 'ul' : 'ol');
			result.append(textResult(example, 'li'), textResult(example, 'li'));
			return {id, syntax: `${marker} ${example}\n${marker} ${example}`, result};
		}));
		const caption = msg('content-file-caption');
		const figure = this.node('figure', 'wikiEditor-help-file');
		figure.append(this.node('span', 'wikiEditor-help-image', '▧'), this.node('figcaption', '', caption));
		page('file', [{id: 'file', syntax: msg('content-file-syntax', this.host.options.fileNamespace ?? 'File', this.host.magicWords.thumbnail, caption), result: figure}]);
		const user = this.host.options.userName ?? msg('content-signature-username');
		const namespaces = [
			this.host.options.userNamespace ?? 'User',
			this.host.options.userTalkNamespace ?? 'User talk',
			user,
		];
		const discussion: Row[] = ['signaturetimestamp', 'signature'].map((id) => ({
			id,
			syntax: msg(`content-${id}-syntax`),
			result: textResult(msg(`content-${id}-example`, ...namespaces)
				.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')),
		}));
		const indent = [
			1,
			2,
			3,
		].map((level) => msg(`content-indent${level}`));
		const indented = this.node('div');
		indent.forEach((text, index) => indented.append(this.node('div', `wikiEditor-help-indent-${index}`, text)));
		discussion.push({id: 'indent', syntax: `${indent[0]}\n:${indent[1]}\n::${indent[2]}`, result: indented});
		page('discussion', discussion);
		this.booklet(this.panels.get('help')!, pages);
	}

	private readSelection(): SavedSelection {
		return {
			start: this.host.textarea.selectionStart,
			end: this.host.textarea.selectionEnd,
			direction: this.host.textarea.selectionDirection,
		};
	}

	private run(action: () => void): void {
		if (this.destroyed) return;
		try {
			// Read live when focus never left the textarea (including programmatic selections).
			if (this.document.activeElement === this.host.textarea)
				this.selection = this.readSelection();
			const {start, end, direction} = this.selection;
			this.host.textarea.setSelectionRange(start, end, direction);
			this.host.focus();
			action();
			// Do not focus after the action: openDialog must retain its own focus.
			this.selection = this.readSelection();
		} catch (error) {
			this.host.reportError(error);
		}
	}

	private onClick(event: Event): void {
		const button = this.closest(event.target, 'button');
		if (!button) return;
		const panel = button.dataset.panel as PanelName | undefined;
		if (panel) {
			this.togglePanel(panel);
			return;
		}
		const id = button.dataset.tool;
		if (id !== undefined) {
			const tool = this.tools.get(id);
			if (tool) this.run(() => tool.definition.action(this.host));
		} else if (button.dataset.character !== undefined)
			this.run(() => this.host.insertText(button.dataset.character!));

	}

	private onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && this.activePanel) {
			event.preventDefault();
			const toggle = this.toggles.get(this.activePanel);
			this.togglePanel(this.activePanel);
			toggle?.focus();
			return;
		}
		const target = this.closest(event.target, 'button');
		if (!target || ![
			'ArrowLeft',
			'ArrowRight',
			'Home',
			'End',
		].includes(event.key)) return;
		const container = target.closest('.wikiEditor-tabs, .wikiEditor-booklet-nav, .wikiEditor-main, .wikiEditor-panel-advanced, .wikiEditor-character-grid');
		if (!container) return;
		const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
		const index = buttons.indexOf(target as HTMLButtonElement);
		if (index < 0 || !buttons.length) return;
		const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
			(index + ((event.key === 'ArrowRight') !== (this.host.direction === 'rtl') ? 1 : -1) + buttons.length) % buttons.length;
		event.preventDefault();
		buttons[next]?.focus();
	}

	private onHotkey(event: KeyboardEvent): void {
		const unavailable = this.host.textarea.disabled || this.host.textarea.readOnly;
		const ignored = event.defaultPrevented || event.isComposing ||
			event.altKey || event.shiftKey;
		if (unavailable || ignored || !(event.ctrlKey || event.metaKey)) return;
		for (const {definition} of this.tools.values())
			if (definition.hotkey && definition.hotkey.toLowerCase() === event.key.toLowerCase()) {
				event.preventDefault();
				this.selection = this.readSelection();
				this.run(() => definition.action(this.host));
				return;
			}

	}
}
