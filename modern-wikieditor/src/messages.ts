/**
 * Adapted from this repository's src/messages.ts.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import english from './en.json';
import type {Messages, WikiEditorOptions} from './types';

/** Text-only formatter: catalog strings never become executable markup. */
export class MessageCatalog {
	private readonly messages: Messages;

	private readonly plural: Intl.PluralRules;

	private readonly siteName: string;

	public constructor(language: string, options: WikiEditorOptions) {
		const defaults: Messages = {};
		for (const [key, value] of Object.entries(english))
			if (typeof value === 'string')
				defaults[key] = value;
		this.messages = Object.assign(
			{}, defaults, ...(options.fallbackMessages || []).slice().reverse(), options.messages,
		);
		this.siteName = options.siteName || 'Wiki';
		try {
			this.plural = new Intl.PluralRules(language);
		} catch {
			this.plural = new Intl.PluralRules('en');
		}
	}

	public get(key: string, ...params: (string | number)[]): string {
		let text = this.messages[key] || key;
		text = text.replace(/\{\{SITENAME\}\}/g, this.siteName);
		// Resolve innermost plural blocks before interpolating parameters.
		text = text.replace(/\{\{PLURAL:\$(\d+)\|([^{}]*)\}\}/g, (_match, index: string, forms: string) => {
			const value = Number(params[Number(index) - 1]);
			const choices = forms.split('|');
			const exact = choices.find((choice) => choice.startsWith(`${value}=`));
			if (exact)
				return exact.slice(exact.indexOf('=') + 1);
			const ordinary = choices.filter((choice) => !/^\d+=/.test(choice));
			const categories = this.plural.resolvedOptions().pluralCategories;
			const category = this.plural.select(value);
			const position = ordinary.length === 2 ? (category === 'one' ? 0 : 1) : categories.indexOf(category);
			return ordinary[position] || ordinary[ordinary.length - 1] || '';
		});
		return text.replace(/\$(\d+)/g, (match, index: string) => String(params[Number(index) - 1] ?? match));
	}
}
