import type {SearchOptions, SelectionRange} from './types';

/** Native textarea text operations shared by all editor commands. */
export class TextSelection {
	constructor(private readonly textarea: HTMLTextAreaElement) {}

	get(): SelectionRange {
		return {start: this.textarea.selectionStart, end: this.textarea.selectionEnd};
	}

	set(start: number, end = start): void {
		const length = this.textarea.value.length;
		this.textarea.setSelectionRange(Math.max(0, Math.min(start, length)), Math.max(0, Math.min(end, length)));
	}

	replace(text: string, select = false): void {
		const {start, end} = this.get();
		const scrollTop = this.textarea.scrollTop;
		this.textarea.setRangeText(text, start, end, select ? 'select' : 'end');
		this.textarea.scrollTop = scrollTop;
	}

	static pattern(search: string, options: SearchOptions = {}): RegExp {
		if (!search)
			throw new Error('Search text must not be empty.');
		let source = options.regex ? search : search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		if (options.wholeWord)
			source = `\\b(?:${source})\\b`;
		return new RegExp(source, options.caseSensitive ? 'g' : 'gi');
	}
}
