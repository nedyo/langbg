# langBG: Bulgarian Cyrillic for Figma

[langbg.com](https://langbg.com) · [MIT](LICENSE)

[Български](#български) · [English](#english)

---

## Български

Шрифтове като Montserrat съдържат българските форми на буквите (д, л, ж, в, г, т, к, ю и др.), но Figma показва руските. Причината е, че Figma не подава езика на текста към шейпинга, затова OpenType функцията `locl` за `cyrl/BGR` никога не се задейства.

langBG е безплатен инструмент с отворен код, който решава проблема в самия шрифт:

- пренасочва правилото `locl` за `BGR` в GSUB таблицата, така че българските форми са включени по подразбиране или като стилов набор;
- преименува шрифта (напр. „Montserrat BG“), за да се инсталира до оригинала, без да го презаписва;
- работи изцяло в браузъра: шрифтовете не напускат компютъра ти.

В кода продължаваш да ползваш оригиналния шрифт с `lang="bg"`. Браузърите прилагат `locl` сами.

### Структура на репото

| Папка | Съдържание |
|---|---|
| `core/` | Python пакет (fontTools): преработка на GSUB, преименуване, отчет, CLI |
| `web/` | Astro сайт с конвертора |
| `catalog/` | Скрипт, който изгражда каталога с OFL шрифтове |

Figma плъгин за Dev Mode: скоро.

---

## English

Fonts like Montserrat ship Bulgarian letterforms (д, л, ж, в, г, т, к, ю and more), but Figma shows the Russian ones. Figma never passes the text language to its shaping engine, so the OpenType `locl` feature for `cyrl/BGR` never fires.

langBG is a free, open-source tool that fixes this in the font itself:

- it redirects the `locl` rule for `BGR` in the GSUB table, so Bulgarian forms are on by default or available as a stylistic set;
- it renames the font (e.g. "Montserrat BG") so it installs next to the original instead of replacing it;
- it runs entirely in the browser: your fonts never leave your machine.

In code you keep using the original font with `lang="bg"`. Browsers apply `locl` on their own.

### Repository layout

| Folder | Contents |
|---|---|
| `core/` | Python package (fontTools): GSUB rewiring, renaming, report, CLI |
| `web/` | Astro site with the converter |
| `catalog/` | Script that builds the catalog of OFL fonts |

Figma Dev Mode plugin: coming soon.

---

## Лиценз / License

Кодът е под лиценз [MIT](LICENSE). Конвертираните шрифтове запазват оригиналните си лицензи.

The code is released under the [MIT](LICENSE) license. Converted fonts keep their original licenses.
