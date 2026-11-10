<template>
	<div
		ref="root"
		class="modern-wikieditor-toolbar"
		:dir="host.direction"
		:lang="host.language"
		@keydown="onKeydown">
		<div class="modern-wikieditor-toolbar-top">
			<div
				role="toolbar"
				:aria-label="host.msg( 'wikieditor-toolbar' )"
				data-keyboard-group>
				<template v-for="section in sections" :key="section.name">
					<template v-if="section.name === 'main'">
						<div
							v-for="group in section.groups"
							:key="group.name"
							class="modern-wikieditor-tool-group"
							role="group"
							:aria-label="groupLabel( group.name )">
							<cdx-button
								v-for="tool in group.tools"
								:key="tool.id"
								type="button"
								weight="quiet"
								:disabled="disabled"
								:aria-label="tool.label"
								:data-tool="tool.id"
								:title="toolTitle( tool )"
								@click="emit( 'tool', tool )"
							>
								<cdx-icon
									v-if="getBuiltinIcon( tool )"
									:icon="getBuiltinIcon( tool )!"
									:dir="host.direction"
									:lang="host.language"
								/>
								<span v-else aria-hidden="true">{{ tool.icon ?? tool.label }}</span>
							</cdx-button>
						</div>
					</template>
				</template>
			</div>
			<div
				role="group"
				:aria-label="host.msg( 'wikieditor-toolbar' )"
				data-keyboard-group>
				<cdx-toggle-button
					v-for="name in panels"
					:key="name"
					type="button"
					:quiet="true"
					:model-value="activePanel === name"
					:data-panel="name"
					:aria-expanded="activePanel === name"
					:aria-controls="`${toolbarId}-${name}`"
					@update:model-value="emit( 'panel', name )"
				>
					{{ panelLabel( name ) }}
					<cdx-icon
						:icon="activePanel === name ? cdxIconUpTriangle : cdxIconDownTriangle"
						:dir="host.direction"
						:lang="host.language"
					/>
				</cdx-toggle-button>
			</div>
		</div>
		<section
			:id="`${toolbarId}-advanced`"
			:hidden="activePanel !== 'advanced'"
			data-panel-content="advanced"
			role="region"
			:aria-label="panelLabel( 'advanced' )"
			class="modern-wikieditor-panel">
			<div data-keyboard-group class="modern-wikieditor-advanced-tools">
				<cdx-select
					:selected="headingValue"
					:menu-items="headingItems"
					:disabled="disabled"
					:default-label="host.msg( 'wikieditor-toolbar-tool-heading' )"
					:aria-label="host.msg( 'wikieditor-toolbar-tool-heading' )"
					@update:selected="selectHeading"
				/>
				<template v-for="section in sections" :key="section.name">
					<template v-if="section.name === 'advanced'">
						<div
							v-for="group in section.groups"
							:key="group.name"
							class="modern-wikieditor-tool-group"
							role="group"
							:aria-label="groupLabel( group.name )">
							<cdx-button
								v-for="tool in group.tools"
								:key="tool.id"
								type="button"
								weight="quiet"
								:disabled="disabled"
								:aria-label="tool.label"
								:data-tool="tool.id"
								:title="toolTitle( tool )"
								@click="emit( 'tool', tool )"
							>
								<cdx-icon
									v-if="getBuiltinIcon( tool )"
									:icon="getBuiltinIcon( tool )!"
									:dir="host.direction"
									:lang="host.language"
								/>
								<span v-else aria-hidden="true">{{ tool.icon ?? tool.label }}</span>
							</cdx-button>
						</div>
					</template>
				</template>
			</div>
		</section>
		<section
			:id="`${toolbarId}-characters`"
			:hidden="activePanel !== 'characters'"
			data-panel-content="characters"
			role="region"
			:aria-label="panelLabel( 'characters' )"
			class="modern-wikieditor-panel">
			<div
				class="modern-wikieditor-booklet-nav"
				role="group"
				:aria-label="panelLabel( 'characters' )"
				data-keyboard-group>
				<cdx-button
					v-for="( group, index ) in characters"
					:key="index"
					type="button"
					weight="quiet"
					:aria-pressed="currentCharacters === group"
					@click="characterPage = index">
					{{ group.label }}
				</cdx-button>
			</div>
			<div
				v-if="currentCharacters"
				class="modern-wikieditor-character-grid"
				role="group"
				:aria-label="currentCharacters.label"
				data-keyboard-group>
				<cdx-button
					v-for="( character, index ) in currentCharacters.characters"
					:key="index"
					class="modern-wikieditor-character"
					type="button"
					weight="quiet"
					:disabled="disabled"
					:title="character"
					@click="emit( 'insert', character )">
					{{ character }}
				</cdx-button>
			</div>
		</section>
		<section
			:id="`${toolbarId}-help`"
			:hidden="activePanel !== 'help'"
			data-panel-content="help"
			role="region"
			:aria-label="panelLabel( 'help' )"
			class="modern-wikieditor-panel">
			<div
				class="modern-wikieditor-booklet-nav"
				role="group"
				:aria-label="panelLabel( 'help' )"
				data-keyboard-group>
				<cdx-button
					v-for="page in helpPages"
					:key="page.id"
					type="button"
					weight="quiet"
					:aria-pressed="helpPage === page.id"
					@click="helpPage = page.id">
					{{ page.label }}
				</cdx-button>
			</div>
			<table
				v-if="currentHelp"
				class="modern-wikieditor-help-table"
				:aria-label="currentHelp.label">
				<thead>
					<tr>
						<th scope="col">
							{{ host.msg( 'wikieditor-toolbar-help-heading-description' ) }}
						</th>
						<th scope="col">
							{{ host.msg( 'wikieditor-toolbar-help-heading-syntax' ) }}
						</th>
						<th scope="col">
							{{ host.msg( 'wikieditor-toolbar-help-heading-result' ) }}
						</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="row in currentHelp.rows" :key="row.id">
						<th scope="row">
							{{ helpDescription( row.id ) }}
						</th>
						<td><code>{{ row.syntax }}</code></td>
						<td class="modern-wikieditor-help-result">
							{{ row.result }}
						</td>
					</tr>
				</tbody>
			</table>
		</section>
	</div>
</template>

<script setup lang="ts">
import {computed, nextTick, ref, useId, watch} from 'vue';
import {CdxButton, CdxIcon, CdxSelect, CdxToggleButton} from '@wikimedia/codex';
import {cdxIconDownTriangle, cdxIconUpTriangle} from '@wikimedia/codex-icons';
import type {EditorHost, PanelName, ToolDefinition} from './types';
import {getBuiltinIcon, LOCAL_CHARACTERS} from './tools';

defineOptions({name: 'EditorToolbar'});
const props = defineProps<{
	host: EditorHost;
	tools: readonly ToolDefinition[];
	activePanel: PanelName | null;
	disabled: boolean;
}>();
const emit = defineEmits<{
	tool: [tool: ToolDefinition];
	insert: [text: string];
	panel: [name: PanelName];
	heading: [level: number];
}>();
const root = ref<HTMLElement | null>(null);
const toolbarId = useId();
const panels: readonly PanelName[] = [
	'advanced',
	'characters',
	'help'
];
const characterPage = ref(0);
const helpPage = ref('format');
const headingValue = ref<string | number | null>(null);
const characters = computed(() => props.host.options.characterGroups ?? LOCAL_CHARACTERS);
const currentCharacters = computed(() =>
	characters.value[characterPage.value] ?? characters.value[0]);
const headingItems = computed(() => [
	2,
	3,
	4,
	5
].map((level) => ({
	value: level,
	label: props.host.msg(`wikieditor-toolbar-tool-heading-${level}`)
})));
const sections = computed(() => (['main', 'advanced'] as const).map((name) => {
	const groups = new Map<string, ToolDefinition[]>();
	for (const tool of props.tools) {
		if ((tool.section ?? 'main') !== name) continue;
		const group = tool.group ?? 'custom';
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group)!.push(tool);
	}
	const orderedGroups = Array.from(groups, ([groupName, groupTools]) => ({
		name: groupName,
		tools: groupTools
	}));
	return {name, groups: orderedGroups};
}));

function toolTitle(tool: ToolDefinition): string {
	return tool.hotkey ? `${tool.label} (Ctrl/⌘+${tool.hotkey})` : tool.label;
}

function helpDescription(name: string): string {
	return props.host.msg(`wikieditor-toolbar-help-content-${name}-description`);
}

function panelLabel(name: PanelName): string {
	return props.host.msg(`wikieditor-toolbar-section-${name}`);
}

function groupLabel(name: string): string {
	return name === 'format' || name === 'insert' ? props.host.msg(`wikieditor-toolbar-group-${name}`) : name;
}

function selectHeading(value: string | number | null): void {
	headingValue.value = value;
	const level = Number(value);
	if (!props.disabled && level >= 2 && level <= 5) emit('heading', level);
	// Reset after Codex processes the selection so the same level can be applied again.
	nextTick(() => {
		headingValue.value = null;
	});
}

function focusPanelButton(name: PanelName): void {
	root.value?.querySelector<HTMLButtonElement>(`button[data-panel="${name}"]`)?.focus();
}

watch(() => props.activePanel, (next, previous) => {
	if (!previous || previous === next) return;
	const panel = root.value?.querySelector<HTMLElement>(`[data-panel-content="${previous}"]`);
	if (panel?.contains(panel.ownerDocument.activeElement)) focusPanelButton(previous);
}, {flush: 'pre'});

function onKeydown(event: KeyboardEvent): void {
	// Let the Codex Select menu own its keyboard behavior, including Escape.
	if (event.defaultPrevented) return;
	const target = event.target as HTMLElement | null;
	if (target?.closest('.cdx-select')) return;
	if (event.key === 'Escape' && props.activePanel) {
		event.preventDefault();
		const name = props.activePanel;
		emit('panel', name);
		focusPanelButton(name);
		return;
	}
	if (![
		'ArrowLeft',
		'ArrowRight',
		'Home',
		'End'
	].includes(event.key)) return;
	const button = target?.closest<HTMLButtonElement>('button');
	const container = button?.closest<HTMLElement>('[data-keyboard-group]');
	if (!button || !container) return;
	const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
	const index = buttons.indexOf(button);
	if (index < 0 || !buttons.length) return;
	const step = (event.key === 'ArrowRight') !== (props.host.direction === 'rtl') ? 1 : -1;
	const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
		(index + step + buttons.length) % buttons.length;
	event.preventDefault();
	buttons[next]?.focus();
}

interface HelpRow {
	id: string;
	syntax: string;
	result: string;
}

/** Only interpolate text: neither translated examples nor Wikitext become HTML. */
const helpPages = computed(() => {
	const host = props.host;
	const msg = (key: string, ...params: (string | number)[]): string =>
		host.msg(`wikieditor-toolbar-help-${key}`, ...params);
	const plain = (value: string): string => value
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
		.replace(/\[\[([^\]]+)\]\]/g, '$1');
	const pages: {id: string; label: string; rows: HelpRow[]}[] = [];
	const page = (id: string, rows: HelpRow[]): void => {
		pages.push({id, label: msg(`page-${id}`), rows});
	};
	page('format', [
		'italic',
		'bold',
		'bolditalic'
	].map((id, index) => {
		const example = msg(`content-${id}-example`);
		const marks = "'".repeat([
			2,
			3,
			5
		][index]);
		return {id, syntax: marks + example + marks, result: example};
	}));
	const url = msg('content-xlink-example-url');
	const label = msg('content-xlink-example-label');
	const internal = msg('content-ilink-example');
	page('link', [{id: 'ilink', syntax: internal, result: plain(internal)}, {id: 'xlink', syntax: msg('content-xlink-example1', url, label), result: `${label}\n[1]\n${url}`}]);
	page('heading', [
		2,
		3,
		4,
		5
	].map((level) => {
		const example = msg(`content-heading${level}-example`);
		const marks = '='.repeat(level);
		return {id: `heading${level}`, syntax: `${marks} ${example} ${marks}`, result: example};
	}));
	page('list', ['ulist', 'olist'].map((id) => {
		const example = msg(`content-${id}-example`);
		const marker = id === 'ulist' ? '*' : '#';
		return {id, syntax: `${marker} ${example}\n${marker} ${example}`, result: `${example}\n${example}`};
	}));
	const caption = msg('content-file-caption');
	page('file', [
		{
			id: 'file',
			syntax: msg('content-file-syntax', host.options.fileNamespace ?? 'File', host.magicWords.thumbnail, caption),
			result: `▧\n${caption}`
		}
	]);
	const namespaces = [
		host.options.userNamespace ?? 'User',
		host.options.userTalkNamespace ?? 'User talk',
		host.options.userName ?? msg('content-signature-username')
	];
	const discussion = ['signaturetimestamp', 'signature'].map((id) => ({
		id,
		syntax: msg(`content-${id}-syntax`),
		result: plain(msg(`content-${id}-example`, ...namespaces))
	}));
	const indent = [
		1,
		2,
		3
	].map((level) => msg(`content-indent${level}`));
	discussion.push({
		id: 'indent',
		syntax: `${indent[0]}\n:${indent[1]}\n::${indent[2]}`,
		result: `${indent[0]}\n  ${indent[1]}\n    ${indent[2]}`
	});
	page('discussion', discussion);
	return pages;
});
const currentHelp = computed(() =>
	helpPages.value.find((page) => page.id === helpPage.value) ?? helpPages.value[0]);
</script>

<style scoped>
.modern-wikieditor-toolbar-top,
.modern-wikieditor-toolbar-top > div,
.modern-wikieditor-tool-group,
.modern-wikieditor-advanced-tools,
.modern-wikieditor-booklet-nav,
.modern-wikieditor-character-grid {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.25rem;
}

.modern-wikieditor-toolbar-top {
	justify-content: space-between;
}

.modern-wikieditor-panel {
	padding: 0.75rem 0;
}

.modern-wikieditor-panel[hidden] {
	display: none;
}

.modern-wikieditor-booklet-nav {
	margin-block-end: 0.75rem;
}

.modern-wikieditor-character {
	min-width: 2.75rem;
}

.modern-wikieditor-help-table {
	width: 100%;
	border-collapse: collapse;
}

.modern-wikieditor-help-table th,
.modern-wikieditor-help-table td {
	padding: 0.5rem;
	text-align: start;
	vertical-align: top;
	overflow-wrap: anywhere;
}

.modern-wikieditor-help-table code,
.modern-wikieditor-help-result {
	white-space: pre-wrap;
}
</style>
