/**
 * Standalone public contracts adapted from this repository's src/types.ts.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
export type Messages = Record<string, string>;
export type PanelName = 'advanced' | 'characters' | 'help';
export type DialogName = 'link' | 'file' | 'table' | 'replace';
export type PreferenceValue = string | number | boolean | string[];

export interface TitleSuggestion {
	title: string;
	exists?: boolean;
	description?: string;
	disambiguation?: boolean;
}

/** Signals are aborted when a request is superseded or the component is destroyed. */
export interface ServiceContext {
	signal: AbortSignal;
	language: string;
}

export interface WikiEditorServices {
	searchTitles?: (query: string, context: ServiceContext) => Promise<TitleSuggestion[]>;
	checkTitle?: (title: string, context: ServiceContext) => Promise<TitleSuggestion>;
	uploadFile?: (file: File, context: ServiceContext) => Promise<{title: string}>;
	/** Return trusted, already sanitized HTML for the component's preview pane. */
	renderPreview?: (wikitext: string, context: ServiceContext) => Promise<string>;
}

export interface CharacterGroup {
	id: string;
	label: string;
	characters: readonly string[];
}

export interface MagicWords {
	redirect: string;
	thumbnail: string;
	left: string;
	center: string;
	right: string;
	none: string;
	frame: string;
	frameless: string;
	alt: string;
}

export interface ToolDefinition {
	id: string;
	label: string;
	section?: 'main' | 'advanced';
	group?: string;
	/** Text symbol, never interpreted as HTML. */
	icon?: string;
	hotkey?: string;
	action(editor: import('./types').EditorHost): void;
}

export interface WikiEditorOptions {
	language?: string;
	/** Supply an imported official JSON catalog or an application-specific override. */
	messages?: Messages;
	fallbackMessages?: readonly Messages[];
	direction?: 'ltr' | 'rtl';
	siteName?: string;
	fileNamespace?: string;
	userNamespace?: string;
	userTalkNamespace?: string;
	userName?: string;
	signature?: string;
	magicWords?: Partial<MagicWords>;
	allowedProtocols?: readonly string[];
	characterGroups?: readonly CharacterGroup[];
	services?: WikiEditorServices;
	preferences?: Record<string, PreferenceValue>;
	/** Host-controlled persistence; the engine never accesses storage or the network. */
	onPreferenceChange?: (key: string, value: PreferenceValue) => void;
	onChange?: (value: string) => void;
	onError?: (error: Error) => void;
	previewDebounce?: number;
	maxTableCells?: number;
	resizable?: boolean;
	tools?: readonly ToolDefinition[];
}

/** Vue events replace imperative options callbacks. The ready event has no payload. */
export type WikiEditorComponentOptions = Omit<
	WikiEditorOptions, 'onChange' | 'onError' | 'onPreferenceChange'
>;

/** The Vue component deliberately does not expose its internal editing engine. */
export interface WikiEditorExpose {
	/** Always throws; there is no legacy WikiEditor instance. */
	getEditor(): never;
	getTextarea(): HTMLTextAreaElement | null;
	focus(): void;
	reinitialize(): void;
}

export interface EncapsulateOptions {
	pre?: string;
	post?: string;
	peri?: string;
	ownline?: boolean;
	splitlines?: boolean;
	regex?: RegExp;
	regexReplace?: string;
}

export interface SearchOptions {
	caseSensitive?: boolean;
	regex?: boolean;
	wholeWord?: boolean;
}

export interface SelectionRange {
	start: number;
	end: number;
}

export interface FileInsertOptions {
	title: string;
	caption?: string;
	alt?: string;
	size?: number;
	align?: 'left' | 'center' | 'right' | 'none';
	format?: 'thumbnail' | 'frame' | 'frameless' | 'none';
}

export interface TableInsertOptions {
	rows: number;
	columns: number;
	header?: boolean;
	wikitable?: boolean;
	sortable?: boolean;
	caption?: string;
}

/** Native editing operations available to dialogs and custom tool callbacks. */
export interface EditorHost {
	readonly textarea: HTMLTextAreaElement;
	readonly element: HTMLElement;
	readonly options: WikiEditorOptions;
	readonly language: string;
	readonly direction: 'ltr' | 'rtl';
	readonly magicWords: MagicWords;
	msg(key: string, ...params: (string | number)[]): string;
	getValue(): string;
	setValue(value: string): void;
	getSelection(): SelectionRange;
	setSelection(start: number, end?: number): void;
	getSelectedText(): string;
	insertText(text: string): void;
	encapsulate(options: EncapsulateOptions): void;
	insertLink(target: string, label?: string, external?: boolean): void;
	insertFile(options: FileInsertOptions): void;
	insertTable(options: TableInsertOptions): void;
	findNext(search: string, options?: SearchOptions): SelectionRange | null;
	replaceSelection(search: string, replacement: string, options?: SearchOptions): boolean;
	replaceAll(search: string, replacement: string, options?: SearchOptions): number;
	openDialog(name: DialogName): void;
	togglePanel(name: PanelName): void;
	addTool(tool: ToolDefinition): void;
	removeTool(id: string): void;
	getPreference(key: string): PreferenceValue | undefined;
	setPreference(key: string, value: PreferenceValue): void;
	focus(): void;
	reportError(error: unknown): void;
}
