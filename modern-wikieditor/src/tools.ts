/* SPDX-License-Identifier: GPL-2.0-or-later */
import {
	cdxIconArticleRedirect, cdxIconBold, cdxIconCode, cdxIconImage,
	cdxIconImageGallery, cdxIconItalic, cdxIconLargerText, cdxIconLink,
	cdxIconListBullet, cdxIconListNumbered, cdxIconNewline, cdxIconNoWikitext,
	cdxIconSearch, cdxIconSignature, cdxIconSmallerText, cdxIconSubscript,
	cdxIconSuperscript, cdxIconTable,
} from '@wikimedia/codex-icons';
import type {Icon} from '@wikimedia/codex-icons';
import {toRaw} from 'vue';
import type {CharacterGroup, EditorHost, EncapsulateOptions, ToolDefinition} from './types';

const builtInIcons: Record<string, Icon> = {
	bold: cdxIconBold,
	italic: cdxIconItalic,
	link: cdxIconLink,
	file: cdxIconImage,
	signature: cdxIconSignature,
	ulist: cdxIconListBullet,
	olist: cdxIconListNumbered,
	code: cdxIconCode,
	nowiki: cdxIconNoWikitext,
	newline: cdxIconNewline,
	big: cdxIconLargerText,
	small: cdxIconSmallerText,
	superscript: cdxIconSuperscript,
	subscript: cdxIconSubscript,
	gallery: cdxIconImageGallery,
	redirect: cdxIconArticleRedirect,
	table: cdxIconTable,
	replace: cdxIconSearch,
};
const toolIcons = new WeakMap<ToolDefinition, Icon>();

/**
 * Look up icons by original definition identity, never by a custom tool's id.
 *
 * @param {ToolDefinition} tool Toolbar definition, possibly a custom replacement.
 * @return {Icon | undefined} The original built-in's icon, otherwise undefined.
 */
export function getBuiltinIcon(tool: ToolDefinition): Icon | undefined {
	return toolIcons.get(toRaw(tool));
}

/** Small local palette, matching the standalone editor rather than MediaWiki core data. */
export const LOCAL_CHARACTERS: readonly CharacterGroup[] = [
	{id: 'common', label: 'Common symbols (local selection)', characters: Array.from('—–…“”‘’«»‹›•·©®™§¶†‡°′″№')},
	{id: 'math', label: 'Mathematics (local selection)', characters: Array.from('±−×÷≈≠≤≥∞√∑∏∫∂∆∇∈∉⊂⊆∪∩∅∀∃¬∧∨')},
	{id: 'latin', label: 'Latin accents (local selection)', characters: Array.from('ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØŒÙÚÛÜÝßàáâãäåæçèéêëìíîïñòóôõöøœùúûüýÿ')},
	{id: 'greek', label: 'Greek (local selection)', characters: Array.from('ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψωςω')},
	{id: 'arrows', label: 'Arrows and currency (local selection)', characters: Array.from('←↑→↓↔↕⇐⇒⇔↗↘↙↖€£¥¢¤₩₹₽')},
];

/**
 * Create built-ins only; the owner merges custom tools by id after these definitions.
 *
 * @param {EditorHost} host Host supplying translated labels and localized magic words.
 * @return {ToolDefinition[]} Built-in definitions, ready to merge with custom tools.
 */
export function createTools(host: EditorHost): ToolDefinition[] {
	const tools: ToolDefinition[] = [];
	const msg = (id: string): string => host.msg(`wikieditor-toolbar-tool-${id}`);
	const wrap = (id: string, pre: string, post = '', extra: EncapsulateOptions = {}) =>
		(editor: EditorHost): void => editor.encapsulate({pre, post, peri: msg(`${id}-example`), ...extra});
	const add = (
		id: string, icon: string, action: ToolDefinition['action'],
		section?: 'main' | 'advanced', group?: string, hotkey?: string,
	): void => {
		const tool: ToolDefinition = {
			id,
			label: msg(id),
			icon,
			action,
			section: section ?? 'main',
			group: group ?? 'format',
			hotkey,
		};
		const builtinIcon = builtInIcons[id];
		if (builtinIcon) toolIcons.set(tool, builtinIcon);
		tools.push(tool);
	};
	add('bold', 'B', wrap('bold', "'''", "'''"), 'main', 'format', 'b');
	add('italic', 'I', wrap('italic', "''", "''"), 'main', 'format', 'i');
	add('link', '🔗', (editor) => editor.openDialog('link'), 'main', 'insert');
	add('file', '▧', (editor) => editor.openDialog('file'), 'main', 'insert');
	add('signature', '✎', (editor) => editor.encapsulate({pre: editor.options.signature ?? '--~~~~'}), 'main', 'insert');
	for (const {id, marker, icon} of [{id: 'ulist', marker: '*', icon: '• ≡'}, {id: 'olist', marker: '#', icon: '1. ≡'}])
		add(id, icon, wrap(id, `${marker} `, '', {
			ownline: true,
			splitlines: true,
			regex: /^([*#:;]*)\s*(.*)$/gm,
			regexReplace: `$1${marker} $2`,
		}), 'advanced');

	add('code', '<>', wrap('code', '<code>', '</code>'), 'advanced');
	add('nowiki', 'W̸', wrap('nowiki', '<nowiki>', '</nowiki>'), 'advanced', 'format', '\\');
	add('newline', '↵', (editor) => editor.encapsulate({pre: '<br>\n'}), 'advanced');
	for (const {id, tag, icon, hotkey} of [
		{id: 'big', tag: 'big', icon: 'A↑', hotkey: undefined},
		{id: 'small', tag: 'small', icon: 'A↓', hotkey: undefined},
		{id: 'superscript', tag: 'sup', icon: 'x²', hotkey: '.'},
		{id: 'subscript', tag: 'sub', icon: 'x₂', hotkey: ','},
	])
		add(id, icon, wrap(id, `<${tag}>`, `</${tag}>`), 'advanced', 'size', hotkey);

	add('gallery', '▧▧', wrap('gallery', '<gallery>\n', '\n</gallery>', {ownline: true}), 'advanced', 'insert');
	add('redirect', '↪', wrap('redirect', `${host.magicWords.redirect} [[`, ']]', {ownline: true}), 'advanced', 'insert');
	add('table', '▦', (editor) => editor.openDialog('table'), 'advanced', 'insert');
	add('replace', '⌕', (editor) => editor.openDialog('replace'), 'advanced', 'search');
	return tools;
}
