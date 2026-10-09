# Test fixtures

All fonts are licensed under the SIL Open Font License 1.1; each folder contains the
family's `OFL.txt`. Files are unmodified downloads, pinned to commits.

| File | Source | sha256 |
|---|---|---|
| `montserrat/Montserrat-Regular.ttf` | [JulietaUla/Montserrat@cc8daf2](https://github.com/JulietaUla/Montserrat/tree/cc8daf2e7085006b9c112542fc82b58afc13521d) `fonts/ttf/` | `3e8abe50c44c82e2242e97d1ec8c0d385c4890cdc50447bcdb8605c81a38cfb2` |
| `montserrat/Montserrat-Italic.ttf` | same, `fonts/ttf/` | `b8fa0ea7f433669d94d27e66ea81cc627deb71861ed9d20f53d7afa1f33ba86a` |
| `montserrat/Montserrat-Regular.otf` | same, `fonts/otf/` (CFF) | `7481d1ab491292cd12cd812153b34951d46be2a6990d55fcb7f9388f3042f784` |
| `montserrat/Montserrat[wght].ttf` | [google/fonts@5e8a3ba](https://github.com/google/fonts/tree/5e8a3ba899557829a76cfdac30fa512bda91d7ca) `ofl/montserrat/` | `0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7` |
| `montserrat/OFL.txt` | google/fonts `ofl/montserrat/` (identical upstream) | `8b7141c03fa4f8d44e6345d5d4931709290f0f67875e452e95ac1fd3a027802e` |
| `ibmplexsans/IBMPlexSans[wdth,wght].ttf` | google/fonts `ofl/ibmplexsans/` | `3b031aa4216174205bd8471f88a49b91f093169e9e87bd5262242bc5967fe2e3` |
| `ibmplexsans/OFL.txt` | google/fonts `ofl/ibmplexsans/` | `7e6b2818edbd8f6a01ae80641cc8f16a51080d08fb4e532be3a0b6f74adb07da` |
| `ptsans/PT_Sans-Web-Regular.ttf` | google/fonts `ofl/ptsans/` | `9cc831490532009bae2b3ce0d39c62adfc889060beb421593bfd9d2396d0f10a` |
| `ptsans/OFL.txt` | google/fonts `ofl/ptsans/` | `2758cf7a872827f39661cf8cc24188113c030447aefb5ca7145993650076ca8c` |

Google Fonts ships Montserrat only as variable fonts, so the statics come from the
upstream commit google/fonts built from.

## Roles
- **Montserrat** (static TTF ×2, static CFF, variable): positive cases. `cyrl/BGR` locl →
  one single-substitution lookup (23 characters). The variable font has FeatureVariations
  (`rvrn` only); tests add a synthetic FeatureVariation on the BGR locl itself.
- **IBM Plex Sans** (variable, wght + wdth): positive case (`cyrl/BGR` locl, 26 characters)
  and the Reserved Font Name case: OFL.txt reserves "Plex", so "IBM Plex Sans BG" is
  refused and a custom family name is required.
- **PT Sans**: negative case (Cyrillic, has BSH/CHU locl but no BGR). Its name ID 13
  declares Reserved Font Names "PT Sans", "PT Serif", "ParaType".
