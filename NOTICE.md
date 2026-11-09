# Notices and license

## WikiEditor upstream

This package is a standalone derivative of the MediaWiki WikiEditor extension supplied in this repository under `official-wikieditor/`. The supplied extension manifest identifies upstream version 0.5.4 and declares **GPL-2.0-or-later**. This package, including its adaptation code, uses the same license. The unmodified GNU GPL version 2 license text is included in `COPYING`; the “or later” grant is recorded here and in `package.json`.

Upstream project: https://www.mediawiki.org/wiki/Extension:WikiEditor

Upstream manifest authors:

- Derk-Jan Hartman
- Trevor Parscal
- Roan Kattouw
- Nimish Gautam
- Adam Miller

The upstream translation catalogs retain their original `@metadata` contributor attribution. All supplied catalogs are copied verbatim into `i18n/`, including the `qqq` translator documentation catalog (not a UI language).

## Vendored Codex icons

Twenty SVG files were copied verbatim from the supplied `D:\dev\codex\packages\codex-icons\src\images` checkout, whose package manifest identifies `@wikimedia/codex-icons` version 2.7.0 and the MIT license. Files were selected by filename, without inspecting or transforming SVG contents. The original copyright and MIT permission notice are retained in `src/icons/LICENSE` and copied to `dist/icons/LICENSE`. No Codex or OOUI JavaScript dependency is introduced. The derivative editor remains GPL-2.0-or-later; these third-party SVG assets retain their MIT license.

Source project: https://gerrit.wikimedia.org/g/design/codex/

## Standalone modifications

The standalone adaptation replaces MediaWiki/ResourceLoader and jQuery-based UI integration with TypeScript classes and native browser DOM APIs. It retains and adapts upstream Wikitext tool semantics, message keys, translation catalogs, and Wikimedia-inspired layout. It does not require MediaWiki, jQuery, jQuery UI, or OOUI at runtime. It does not ship a Wikitext parser, MediaWiki services, account integration, telemetry, or a backend.

The native controls and built-in common-character subset are not the original OOUI widgets or MediaWiki core special-character database. Built-in toolbar icons use vendored Codex SVG assets, not the OOUI runtime icon package. They must not be described as pixel-identical UI or a complete copy of those external assets. Upstream `official-wikieditor/` is not modified and is not required to build the published package.

The publication includes the adaptation's TypeScript source, build configuration, messages, stylesheet, and license text alongside the compiled ESM files. This is a derivative distribution, not an official Wikimedia release. Upstream names do not imply endorsement.

Host applications remain responsible for callback-provided services, authentication, persistence, sanitizing preview HTML, and complying with applicable licenses when distributing a combined work.
