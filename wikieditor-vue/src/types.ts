import type {WikiEditor, WikiEditorOptions} from 'wikieditor-without-mw';

export type WikiEditorComponentOptions = Omit<
	WikiEditorOptions, 'onChange' | 'onError' | 'onPreferenceChange'
>;

export interface WikiEditorExpose {
	getEditor(): WikiEditor | null;
	getTextarea(): HTMLTextAreaElement | null;
	focus(): void;
	reinitialize(): void;
}
