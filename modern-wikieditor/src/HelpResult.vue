<template>
	<em v-if="id === 'italic'">{{ text }}</em>
	<strong v-else-if="id === 'bold'">{{ text }}</strong>
	<strong v-else-if="id === 'bolditalic'"><em>{{ text }}</em></strong>
	<component
		:is="headingTag"
		v-else-if="headingTag"
		class="modern-help-heading">
		{{ text }}
	</component>
	<component
		:is="id === 'ulist' ? 'ul' : 'ol'"
		v-else-if="id === 'ulist' || id === 'olist'"
		class="modern-help-list">
		<li v-for="( line, index ) in lines" :key="index">
			{{ line }}
		</li>
	</component>
	<div v-else-if="id === 'ilink' || id === 'signature' || id === 'signaturetimestamp'">
		<div v-for="( line, lineIndex ) in linkedLines" :key="lineIndex">
			<template v-for="( part, partIndex ) in line" :key="partIndex">
				<!-- Internal destinations are illustrative; no site route is assumed. -->
				<a
					v-if="part.link"
					class="modern-help-link"
					role="link"
					aria-disabled="true">{{ part.text }}</a>
				<template v-else>
					{{ part.text }}
				</template>
			</template>
		</div>
	</div>
	<div v-else-if="id === 'xlink'" class="modern-help-external">
		<a
			:href="externalUrl"
			:aria-disabled="!externalUrl || undefined"
			rel="noopener noreferrer">{{ lines[0] }}</a>
		<a
			:href="externalUrl"
			:aria-disabled="!externalUrl || undefined"
			rel="noopener noreferrer">{{ lines[1] }}</a>
		<a
			:href="externalUrl"
			:aria-disabled="!externalUrl || undefined"
			rel="noopener noreferrer">{{ lines[2] }}</a>
	</div>
	<figure v-else-if="id === 'file'" class="modern-help-file">
		<div class="modern-help-image">
			<cdx-icon :icon="cdxIconImage" />
		</div>
		<figcaption>{{ text }}</figcaption>
	</figure>
	<div v-else-if="id === 'indent'">
		<div
			v-for="( line, index ) in lines"
			:key="index"
			:style="{ marginInlineStart: `${index * 2}em` }">
			{{ line }}
		</div>
	</div>
	<span v-else>{{ text }}</span>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {CdxIcon} from '@wikimedia/codex';
import {cdxIconImage} from '@wikimedia/codex-icons';

const props = defineProps<{id: string; text: string; syntax: string}>();
const lines = computed(() => props.text.split('\n'));
const headingTag = computed(() => ({heading2: 'h2', heading3: 'h3', heading4: 'h4', heading5: 'h5'}[props.id]));
// Parse only the documented internal-link notation, never HTML or arbitrary Wikitext.
const linkedLines = computed(() => {
	const source = props.id === 'ilink' ? props.syntax : props.text;
	return source.split('\n').map((line) => {
		const parts: {text: string; link: boolean}[] = [];
		const pattern = /\[\[([^\]\n]+)\]\]/g;
		let end = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(line)) !== null) {
			const separator = match[1].indexOf('|');
			const label = separator < 0 ? match[1] : match[1].slice(separator + 1);
			parts.push({text: line.slice(end, match.index), link: false});
			parts.push({text: label, link: true});
			end = match.index + match[0].length;
		}
		parts.push({text: line.slice(end), link: false});
		return parts;
	});
});
const externalUrl = computed(() => {
	const candidate = lines.value[2] ?? '';
	// Only HTTP(S) examples become navigable. Invalid/custom protocols stay inert.
	try {
		const url = new URL(candidate);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
	} catch {
		return undefined;
	}
});
</script>

<style scoped>
.modern-help-heading { margin-block: 0.25em; border: 0; padding: 0; color: inherit; }
h2.modern-help-heading { font-size: 1.5em; }
h3.modern-help-heading { font-size: 1.25em; }
h4.modern-help-heading { font-size: 1.1em; }
h5.modern-help-heading { font-size: 1em; }
.modern-help-list { margin-block: 0; padding-inline-start: 2em; list-style-position: outside; }
ul.modern-help-list { list-style-type: disc; }
ol.modern-help-list { list-style-type: decimal; }
.modern-help-link, .modern-help-external a {
	color: var(--color-progressive, #36c);
	text-decoration: underline;
}
.modern-help-external { display: grid; gap: 0.25em; }
.modern-help-file {
	margin: 0;
	padding: 8px;
	border: 1px solid var(--border-color-subtle, #c8ccd1);
	inline-size: fit-content;
}
.modern-help-image {
	display: grid;
	place-items: center;
	inline-size: 120px;
	block-size: 72px;
	background: var(--background-color-neutral, #eaecf0);
}
.modern-help-file figcaption { padding-block-start: 4px; }
</style>
