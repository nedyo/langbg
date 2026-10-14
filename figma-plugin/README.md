# langBG Handoff

[Български](#български) · [English](#english)

---

## Български

Плъгин за Figma към [langbg.com](https://langbg.com). Във Figma дизайнерът ползва „Montserrat BG“, копие на шрифта с включени български форми. В кода трябва оригиналът „Montserrat“ и `lang="bg"`. langBG Handoff показва точно този CSS.

### Какво прави
- Маркираш текстов слой и плъгинът показва CSS-а му: `font-family` с оригиналното име, `font-weight`, `font-size`, `line-height`, `letter-spacing` и `font-style` за курсив. Най-отгоре е напомнянето за `lang="bg"`.
- Ако в един слой има няколко шрифта, получаваш по един CSS блок за всеки, по реда, в който се появяват.
- Шрифт без наставката „ BG“ показва CSS-а си без промяна и с един ред „не е шрифт на langBG“, без напомнянето за `lang`.
- Под CSS-а са „Бележки за имплементация“: за всеки шрифт на langBG кое име да се ползва в кода, веднъж бележка за `lang="bg"` и накрая ред, че плъгинът само чете. Без шрифт на langBG остава само последният ред. Езикът е български или английски, по избор.

### Два режима
- **Design режим** (и на безплатния Starter план): Plugins → langBG Handoff. Отваря се малък панел. Маркираш текст или frame и копираш CSS-а с бутона.
- **Dev Mode** (платени планове): Inspect → Code → от менюто за език избираш „langBG Handoff“. Езикът на бележките се сменя в настройките на кода.

### Какво обещава
- **Само чете.** Не променя нищо във файла: не пише във възлите, не създава и не трие нищо. Тестовете в `test/` пазят това.
- **Без мрежа.** `networkAccess` е `["none"]` и в Community пише „No access“. Панелът не зарежда нищо отвън.
- **Разпознава само наставката „ BG“** (с интервал, главни букви): „Montserrat BG“ → „Montserrat“. Шрифт с име, което си избрал сам в конвертора, не се разпознава. Плъгинът не пази списък с имена.

### Как да го пробваш във Figma desktop
1. В тази папка: `pnpm install`, после `pnpm build`. Ще се появят `dist/code.js` и `dist/ui.html`.
2. Във Figma desktop отвори някой файл → Plugins → Development → Import plugin from manifest…
3. Избери `figma-plugin/manifest.json`.
4. Пускаш го от Plugins → Development → langBG Handoff. В Dev Mode е в Inspect → Code.

При промяна в кода пусни `pnpm build` пак и рестартирай плъгина.

### Разработка
- `pnpm check`: TypeScript (плъгинът и панелът имат отделни tsconfig).
- `pnpm test`: тестове с `node --test`. Пусни `pnpm build` преди тях, за да се провери и готовият панел.
- `src/css.ts` е общият модул: от „run“-ове към CSS и бележки. `src/collect.ts` чете от документа само с getter-и. `src/code.ts` е входната точка. `src/ui.ts` и `src/ui.html` са панелът. `src/strings.ts` съдържа всички текстове на двата езика.

---

## English

A Figma plugin for [langbg.com](https://langbg.com). In Figma, designers use "Montserrat BG", a copy of the font with Bulgarian forms turned on. Code needs the original "Montserrat" plus `lang="bg"`. langBG Handoff shows exactly that CSS.

### What it does
- Select a text layer and the plugin shows its CSS: `font-family` with the original name, `font-weight`, `font-size`, `line-height`, `letter-spacing`, and `font-style` for italics. A `lang="bg"` reminder comes first.
- A layer with several fonts gets one CSS block per font, in the order they appear.
- A font without the " BG" suffix keeps its CSS as it is, with a one-line "not a langBG font" note and no `lang` reminder.
- Below the CSS are the "Implementation notes": for each langBG font, which name to use in code; one note about `lang="bg"`; and a closing line that the plugin only reads. Without a langBG font, only the closing line remains. In Bulgarian or English.

### Two modes
- **Design mode** (also on the free Starter plan): Plugins → langBG Handoff opens a small panel. Select text or a frame and copy the CSS with the button.
- **Dev Mode** (paid plans): Inspect → Code → pick "langBG Handoff" in the language menu. The notes' language is in the code settings.

### Promises
- **Read-only.** It never changes your file: no writes to nodes, nothing created or deleted. The tests in `test/` guard this.
- **No network.** `networkAccess` is `["none"]`, so the Community page says "No access". The panel loads nothing from outside.
- **Recognizes the " BG" suffix only** (with the space, capital letters): "Montserrat BG" → "Montserrat". A font you gave a custom name in the converter isn't recognized. The plugin keeps no list of names.

### Try it in Figma desktop
1. In this folder: `pnpm install`, then `pnpm build`. You get `dist/code.js` and `dist/ui.html`.
2. In Figma desktop, open a file → Plugins → Development → Import plugin from manifest…
3. Pick `figma-plugin/manifest.json`.
4. Run it from Plugins → Development → langBG Handoff. In Dev Mode, it's under Inspect → Code.

After a code change, run `pnpm build` again and restart the plugin.

### Development
- `pnpm check`: TypeScript (the plugin and the panel have separate tsconfigs).
- `pnpm test`: tests with `node --test`. Run `pnpm build` first so the built panel is checked too.
- `src/css.ts` is the shared module (runs → CSS and notes). `src/collect.ts` reads the document with getters only. `src/code.ts` is the entry point. `src/ui.ts` and `src/ui.html` are the panel. `src/strings.ts` holds every string in both languages.

---

## Publishing checklist (Figma Community)

1. **ID:** Plugins → Development → New plugin… gives a real plugin ID. Put it in `manifest.json` (`id`) and import again. Today's `langbg-handoff` only works for local testing.
2. **Name:** "langBG Handoff". No "Figma" or "Fig" in the name (Figma's trademark rules).
3. **Icon:** 128 × 128 px PNG.
4. **Cover:** 1920 × 960 px PNG (or GIF/video) showing the Design mode panel next to a Dev Mode CSS section.
5. **Tagline and description in BG + EN:** what it does, both modes, read-only, no network, " BG" suffix only. Link to https://langbg.com.
6. **Network access:** confirm the listing says "No access".
7. **Support contact** and **tags** (bulgarian, cyrillic, css, handoff, typography).
8. `pnpm check && pnpm build && pnpm test`, then Plugins → Development → langBG Handoff → Publish.
9. Before submitting, check the published build in Dev Mode: one forum report says codegen stopped showing after publishing with `editorType ["figma","dev"]`. If that happens here, switch the Dev Mode part to `"inspect"`.
10. After approval, set `figmaPlugin` in `web/src/data/site.ts` to the Community URL. The site then shows the link instead of "coming soon", in both languages.
