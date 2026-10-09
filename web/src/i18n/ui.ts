// Every string the interface shows lives in this file, in both languages.
// `bg` defines the shape; `en` must match it, so a missing translation fails `astro check`.
// Strings are plain data with {placeholders} (no functions), so the converter's part of the
// dictionary can be serialised to JSON and handed to the browser island as it is.
// FAQ answers may hold links as [text](href); an href that starts with "/" is a site path in Bulgarian.

export const languages = ["bg", "en"] as const;
export type Lang = (typeof languages)[number];
export const defaultLang: Lang = "bg";

/** The sample text used everywhere a font is previewed. It is Bulgarian on purpose, on both sites. */
export const PANGRAM = "Жълтата дюля беше щастлива, че пухът, който цъфна, замръзна като гьон.";

/** Letters whose Bulgarian form differs from the default one in the site fonts (an e2e test checks it). */
export const SAMPLER_LETTERS = "вгджзийклптцчшщю";

const FIGMA_REQUEST = "https://forum.figma.com/share-your-feedback-26/issue-with-bulgarian-cyrillic-on-fonts-23941";

const bg = {
  lang: { code: "bg", nativeName: "Български", short: "BG" },
  site: { name: "langBG", ogLocale: "bg_BG" },
  nav: {
    skip: "Към съдържанието",
    home: "langBG - начална страница",
    primary: "Основно меню",
    converter: "Конвертор",
    catalog: "Каталог",
    about: "За проекта",
    language: "Език",
    // Shown on the other language's pages as the tooltip of the link to this language.
    switchTitle: "Тази страница на български",
    theme: "Тъмна тема",
  },
  home: {
    metaTitle: "langBG - българска кирилица във Figma",
    metaDescription:
      "Включи българските форми на буквите във Figma. Безплатен конвертор на шрифтове, който работи изцяло в браузъра.",
    jsonLdDescription: "Безплатен конвертор, който включва българските форми на буквите във Figma. Работи в браузъра.",
    heroTitle: "Българска кирилица във Figma.",
    heroLede: "Шрифтът вече има български форми. langBG ги прави лесно и бързо по подразбиране.",
    ctaPrimary: "Конвертирай шрифт",
    ctaSecondary: "Разгледай каталога",
    sampler: { before: "Figma днес", after: "След langBG" },
    samplerLabel: "Едни и същи букви: във Figma днес и след langBG",
    benefits: {
      items: [
        {
          title: "Глифовете са на автора",
          text: "langBG не рисува и не подменя букви. Включва формите, които авторът вече е нарисувал за български.",
        },
        {
          title: "OpenType функциите остават",
          text: "Пренасочва се само правилото locl. Лигатурите, капителите и контекстните алтернативи не се пипат.",
        },
        {
          title: "Нищо не се качва",
          text: "Конвертирането става в браузъра ти (WebAssembly). Без сървър, акаунт и бисквитки.",
        },
        {
          title: "До оригинала, не вместо него",
          text: "Копието се инсталира като „Montserrat BG“. Оригиналът остава за кода и другите приложения.",
        },
      ],
    },
    modes: {
      title: "Два режима. Избираш при конвертиране.",
      items: [
        { title: "По подразбиране", text: "Българските форми са винаги включени. За проекти само на български." },
        {
          title: "Стилов набор",
          text: "Българските форми се включват от Type settings, както при IBM Plex. За проекти с текст и на други езици с кирилица.",
        },
      ],
    },
  },
  converter: {
    title: "Конвертор",
    intro: "Добави .ttf или .otf - цялото семейство наведнъж. Добави и OFL.txt, за да влезе в ZIP-а.",
    dropTitle: "Пусни шрифтовете тук",
    dropHint: "Файловете не се качват никъде. Всичко се случва в браузъра ти.",
    choose: "Избери файлове",
    clear: "Изчисти",
    noscript: "Конверторът има нужда от JavaScript и WebAssembly.",
    runtime: {
      idle: "Подготвям конвертора…",
      loadingPython: "Подготвям конвертора (еднократно, около 10 MB)…",
      loadingPackages: "Зареждам fontTools и langBG…",
      ready: "Конверторът е готов.",
      file: "Файл {done} от {total}: {name}",
      error: "Конверторът не се зареди ({message}). Презареди страницата.",
      skipped: "Пропуснати файлове (не са шрифтове): {names}",
    },
    report: {
      license: "Лиценз: {name}",
      analyzing: "Проверявам шрифта…",
      family: "Семейство",
      designer: "Дизайнер",
      bulgarianForms: "Български форми",
      bulgarianFormsValue: "да, {count} букви",
      letters: "Букви, които се променят",
      kind: "Вид",
      kindVariable: "вариативен",
      kindStatic: "статичен",
      kindCff: "CFF",
      kindTrueType: "TrueType",
      ssInFont: "Стилови набори в шрифта",
      ssBulgarian: "От тях с български форми",
      none: "няма",
      ssNamed: "{tag} („{name}“)",
      technical: "Технически подробности",
      scripts: "Писмености",
      lookups: "Lookup-и",
      lookupRules: "{kind} №{index} ({rules} правила)",
      lookupPlain: "{kind} №{index}",
    },
    warnings: {
      langsys_mismatch:
        "Писменост {script}: при BGR шрифтът включва и други функции освен locl (само при BGR: {onlyBgr}; само без език: {onlyDefault}). Пренася се само locl, затова резултатът може леко да се различава от оригинала с lang=\"bg\".",
    },
    notices: {
      noBgr: "Този шрифт няма български форми (няма locl за BGR). Нищо не е променено и няма какво да конвертираш.",
      alreadyConverted: "Този шрифт вече е конвертиран с langBG.",
      worksViaSs:
        "Този шрифт няма нужда от конвертиране: българските форми са в {set}. Включи го от Type settings. Конвертирай, ако искаш да са включени по подразбиране.",
      featureVariations:
        "Във вариативния шрифт българските форми зависят от осите. Пренасят се, но провери резултата във Figma.",
      reservedName: "Шрифтът има Reserved Font Name. Копието е за собствена употреба - не го разпространявай.",
    },
    name: {
      legend: "Име на новия шрифт",
      suffixLabel: "Оригиналното име с наставка",
      suffixInput: "Наставка",
      suffixResult: "Ще се казва „{name}“.",
      customLabel: "Свое име",
      customInput: "Име на семейството",
      wholeFamily: "Името важи за цялото семейство (файлове: {count}).",
      multiFamily: "Файловете са от различни семейства ({families}). Конвертирай всяко отделно.",
      emptySuffix: "Напиши наставка.",
      emptyName: "Напиши име на семейството.",
    },
    advanced: {
      summary: "Допълнителни настройки",
      stylisticLabel: "Български форми като стилов набор",
      stylisticHelp:
        "Ползвай го, ако искаш оригиналните форми да остават по подразбиране, а българските да се включват от панела за типография на Figma (набор „Български форми“).",
    },
    convert: { button: "Конвертирай", busy: "Конвертирам…" },
    results: {
      title: "Готово",
      ok: "{file} → {out} („{family}“)",
      failed: "{file}:",
      rememberTitle: "Запомни",
      rememberLine: "{name} = {original}",
      rememberHow: "Във Figma: „{name}“. В кода: „{original}“ и lang=\"bg\".",
      copy: "Копирай",
      copied: "Копирано",
      copyFailed: "Не успях да копирам. Маркирай реда и го копирай ръчно.",
      download: "Свали ZIP",
      downloadHint: "Шрифтовете, лицензът (ако е добавен) и README.txt.",
    },
    errors: {
      no_bgr_forms: "Шрифтът няма български форми (няма locl за BGR). Нищо не е променено.",
      already_converted: "Този шрифт вече е конвертиран с langBG.",
      unsupported_font: "Файлът не се чете като шрифт. Добави .ttf или .otf - WOFF2 още не се поддържа.",
      no_free_stylistic_set:
        "Няма свободен стилов набор (ss01–ss20 са заети). Махни отметката „Български форми като стилов набор“ и конвертирай пак.",
      invalid_family_name: "Името не може да е празно или същото като оригиналното.",
      internal_error: "Конвертирането спря ({message}). Опитай пак; ако се повтори, съобщи в GitHub.",
      fallback: "Грешка: {message}",
    },
    readme: {
      heading: "{name} - направен с langbg.com",
      remember: "Запомни: {name} = {original}",
      basedOn: "Създаден на основата на {original}{by}. Българските форми са включени с langbg.com.",
      by: " от {designer}",
      figma: "Във Figma избирай „{name}“.",
      code: "В кода: „{original}“ и lang=\"bg\" на страницата. Браузърът показва българските форми сам.",
      install:
        "Инсталиране: Windows: маркирай файловете, десен бутон, Инсталиране. macOS: двоен клик, Инсталиране на шрифт. После рестартирай Figma.",
      files: "Файлове:",
      license:
        "Лиценз: шрифтът е изменено копие на {original} и остава под лиценза, който е в тази папка. Оригиналното име не се ползва в името на копието.",
      licenseMissing:
        "Лиценз: в ZIP-а няма лицензен файл. Добави лиценза на оригиналния шрифт, преди да споделиш копието.",
      mode: "Режим: български форми по подразбиране.",
      modeStylistic: "Режим: стилов набор {set} („Български форми“). Включи го от панела за типография на Figma.",
    },
  },
  preview: {
    title: "Преглед",
    lede: "Един шрифт, едни и същи букви. Горе - както ги показва Figma, долу - след langBG.",
    now: "Във Figma сега",
    with: "С langBG",
    font: "Шрифт",
    demoNote: "Това е пример със шрифта на сайта. Конвертирай свой шрифт и ще го видиш тук.",
    ready: "Шрифтовете са заредени.",
    rejected: "Браузърът отхвърли шрифта: {message}",
  },
  install: {
    title: "Как се инсталира шрифтът",
    steps: [
      { title: "Разархивирай ZIP-а", text: "Извади файловете от архива, най-добре в отделна папка." },
      {
        title: "Инсталирай шрифтовете",
        text: "Windows: маркирай всички файлове, десен бутон, Инсталиране. macOS: двоен клик, после Инсталиране на шрифт.",
      },
      {
        title: "Рестартирай Figma",
        text: "Рестартирай Figma. За Figma в браузъра ти трябва Figma Font Installer. Търси новото име, напр. „Montserrat BG“.",
      },
    ],
  },
  handoff: {
    title: "Едно име за дизайна, друго за кода.",
    text: [
      "Във Figma избираш „Montserrat BG“, в кода остава „Montserrat“. Браузърът показва българските форми сам, щом страницата е с lang=\"bg\".",
      "За разработчика:",
    ],
    cssComment: "във Figma: Montserrat BG",
    soon: "Скоро: плъгин за Figma Dev Mode. Няма да променя нищо във файла ти: само ще показва правилния CSS, с оригиналното име на шрифта и бележка за lang=\"bg\".",
  },
  link: { newTab: "отваря се в нов раздел" },
  code: {
    copy: "Копирай",
    copied: "Копирано",
    copyFailed: "Маркирано - копирай ръчно",
  },
  faq: {
    title: "Често задавани въпроси",
    items: [
      {
        q: "Законно ли е да променям шрифта?",
        a: [
          "При OFL - да, лицензът позволява промени.",
          "Ако шрифтът има Reserved Font Name (напр. IBM Plex), копието пак се казва „<име> BG“ и е за собствена употреба - не го разпространявай. За друго име ползвай „Свое име“.",
        ],
      },
      {
        q: "Качват ли се шрифтовете някъде?",
        a: ["Не. Конвертирането е в браузъра ти. Няма сървър, няма акаунти, няма бисквитки."],
      },
      {
        q: "Трябва ли колегите ми да инсталират копието?",
        a: ["Да - всеки, който отваря файла. Иначе Figma показва друг шрифт на негово място."],
      },
      {
        q: "С кои шрифтове работи?",
        a: [
          "С тези, които имат български форми в locl за BGR. langBG проверява шрифта при добавяне и казва, ако няма какво да включи.",
          "Готови шрифтове има в [каталога](/fonts/) - конвертираш ги с един клик.",
        ],
      },
      {
        q: "Променя ли се оригиналният шрифт?",
        a: ["Не. Създава се отделно копие с ново име; оригиналът не се пипа."],
      },
      {
        q: "Защо Figma не го прави сама?",
        a: [
          `Figma не подава езика на текста към шрифта. [Заявката](${FIGMA_REQUEST}) е отворена от 2021 г. Докато Figma не я реши, langBG е заобиколният път.`,
        ],
      },
    ],
  },
  fonts: {
    metaTitle: "Шрифтове с българска кирилица - langBG",
    metaDescription: "Шрифтове от Google Fonts с български форми, готови за Figma. Повечето се конвертират с един клик в браузъра.",
    title: "Шрифтове с българска кирилица",
    lede: "Шрифтове от Google Fonts с нарисувани български форми. Един клик - и шрифтът е готов за Figma. Файлът се изтегля от GitHub и се конвертира в браузъра ти.",
    mockNotice: "Това е малка извадка от каталога. Целият каталог ще се появи скоро.",
    filter: {
      label: "Покажи",
      all: "Всички",
      convert: "С конвертиране",
      native: "Без конвертиране",
      help: {
        convert: "Конвертираш с един клик и получаваш ZIP.",
        native: "Българските форми са в стилов набор (ssXX). Включваш го от Type settings.",
      },
    },
    by: "от {designer}",
    view: "Виж шрифта",
    inFigma: "Във Figma: {name}",
    nativeLabel: "Работи във Figma без конвертиране - включи {set}",
    empty: "Още няма шрифтове.",
    detail: {
      metaTitle: "{name} за Figma с български форми - langBG",
      metaDescription: "{name} с български форми във Figma. Конвертиране с един клик в браузъра, лиценз {license}.",
      metaDescriptionNative: "{name} има български форми в {set} и работи във Figma без конвертиране. Лиценз {license}.",
      back: "Всички шрифтове",
      testerTitle: "Твоят текст",
      testerLabel: "Текст за проба",
      testerSize: "Размер",
      lettersTitle: "Букви, които се променят",
      lettersHelp: "Така изглеждат в „{name}“ без никакви настройки.",
      lettersHelpNative: "Така изглеждат в „{name}“, когато е включен {set}.",
      testerNote: "Прегледът е с lang=\"bg\" - така ще изглежда във Figma след конвертиране.",
      testerNoteNative: "Прегледът е с lang=\"bg\" - така ще изглежда във Figma, когато включиш {set}.",
      testerLimit: "В прегледа има само български и латински букви, цифри и най-често ползваните знаци.",
      infoTitle: "За шрифта",
      rows: {
        figmaName: "Име във Figma",
        original: "Оригинал",
        designer: "Дизайнер",
        license: "Лиценз",
        styles: "Стилове",
        axes: "Оси",
        source: "Източник",
      },
      noAxes: "няма",
      nativeHow: "Във Figma: маркирай текста → Type settings → {set}. Нищо не се сваля.",
      get: {
        button: "Изтегли за Figma",
        hint: "Конвертирани шрифтове, лиценз и README.txt.",
        note: "Изтегля се от google/fonts и се конвертира в браузъра ти. Тук не се пазят копия.",
        fetching: "Изтеглям от GitHub: {done} от {total}…",
        done: "„{name}.zip“ е свален. Инсталирай шрифтовете и рестартирай Figma.",
        errorTitle: "Не успях да подготвя ZIP-а",
        networkError: "Няма връзка с GitHub. Провери интернета и опитай пак.",
        httpError: "GitHub върна грешка {status} за „{file}“. Опитай пак след малко.",
        timeout: "GitHub не отговори навреме. Опитай пак.",
        convertError: "„{file}“ не можа да се конвертира: {message}",
        help: "Или свали шрифта от Google Fonts и го добави в конвертора:",
        helpSource: "Или свали шрифта от източника му и го добави в конвертора:",
        googleFonts: "Отвори в Google Fonts",
        sourceButton: "Към източника",
        manual: "Към конвертора",
        noscript:
          "За свалянето е нужен JavaScript. Оригиналния шрифт можеш да вземеш от Google Fonts, но и конверторът има нужда от JavaScript.",
        noscriptSource:
          "За свалянето е нужен JavaScript. Оригиналния шрифт можеш да вземеш от източника му, но и конверторът има нужда от JavaScript.",
      },
      licenseTitle: "Лиценз",
      licenseText:
        "Шрифтът е под лиценза {license}. Позволено е да го ползваш, да го споделяш и да го променяш, стига копията да са под същия лиценз.",
      licenseInZip: "Лицензът е в ZIP-а.",
      licenseLink: "Прочети лиценза",
      installLink: "Как се инсталира",
      mockNotice: "Този шрифт е от малка извадка на каталога. Целият каталог ще се появи скоро.",
    },
  },
  about: {
    metaTitle: "За проекта - langBG",
    metaDescription: "Кой е направил langBG, как да се включиш и на какъв отворен код се крепи.",
    title: "За проекта",
    who: {
      title: "Кой го прави",
      text: [
        "Аз съм Недялко Стоянов, Product Designer от Велико Търново.",
        "С колегите ми всеки ден работим с българска кирилица във Figma и шрифтове от Google Fonts. Figma не показва българските им форми, а официално решение няма от години. Затова проучих темата и я събрах в този инструмент, за да е по-лесна общата работа на дизайнери и разработчици.",
        "Надявам се langBG да има кратък живот, защото това ще значи, че Figma е решила проблема. Дотогава langBG е тук и ще се радвам да го развиваме заедно, за общността.",
      ],
      repo: "langBG в GitHub",
    },
    involve: {
      title: "Включи се",
      text: "langBG е безплатен и ще остане такъв. Ако ти спестява време или имаш идея как да стане по-добър, намери ме в LinkedIn.",
      button: "Пиши ми в LinkedIn",
    },
    credits: {
      title: "Отворен код, на който се крепи langBG",
      intro: "Благодаря на хората зад тези проекти. Всички са с отворен лиценз.",
      items: {
        pyodide: "Python в браузъра. С него конверторът работи без сървър.",
        fonttools: "Чете и записва шрифтовете; конвертирането е изградено върху него.",
        fflate: "Прави ZIP архивите за изтегляне.",
        astro: "Сглобява този сайт.",
        fonts: "Шрифтовете на сайта: Spectral и Source Sans 3.",
      },
    },
  },
  footer: {
    tagline: "Безплатен проект с отворен код.",
    privacy: "Шрифтовете не напускат компютъра ти.",
    source: "Кодът в GitHub",
    license: "Лиценз MIT",
  },
  notFound: {
    metaTitle: "Страницата не е намерена - langBG",
    title: "Тази страница я няма",
    text: "Адресът може да е грешен или страницата да е преместена.",
    home: "Към началната страница",
  },
};

export type Dict = typeof bg;

const en: Dict = {
  lang: { code: "en", nativeName: "English", short: "EN" },
  site: { name: "langBG", ogLocale: "en_US" },
  nav: {
    skip: "Skip to content",
    home: "langBG - home",
    primary: "Main menu",
    converter: "Converter",
    catalog: "Catalog",
    about: "About",
    language: "Language",
    switchTitle: "This page in English",
    theme: "Dark theme",
  },
  home: {
    metaTitle: "langBG - Bulgarian Cyrillic in Figma",
    metaDescription: "Turn on Bulgarian letterforms in Figma. A free font converter that runs entirely in your browser.",
    jsonLdDescription: "A free converter that turns on Bulgarian letterforms in Figma. Runs in the browser.",
    heroTitle: "Bulgarian Cyrillic in Figma.",
    heroLede: "Your font already has Bulgarian forms. langBG makes them the default - quickly and easily.",
    ctaPrimary: "Convert a font",
    ctaSecondary: "Browse the catalog",
    sampler: { before: "Figma today", after: "With langBG" },
    samplerLabel: "The same letters: in Figma today and with langBG",
    benefits: {
      items: [
        {
          title: "The type designer’s glyphs",
          text: "langBG draws nothing and swaps no glyphs. It turns on the forms the designer already made for Bulgarian.",
        },
        {
          title: "OpenType features stay intact",
          text: "Only the locl rule is redirected. Ligatures, small caps and contextual alternates are left as they are.",
        },
        {
          title: "Nothing is uploaded",
          text: "Conversion runs in your browser (WebAssembly). No server, no account, no cookies.",
        },
        {
          title: "Next to the original",
          text: "The copy installs as “Montserrat BG”. The original stays for code and other apps.",
        },
      ],
    },
    modes: {
      title: "Two modes. You choose when converting.",
      items: [
        { title: "Default", text: "Bulgarian forms are always on. For Bulgarian-only projects." },
        {
          title: "Stylistic set",
          text: "Bulgarian forms are a toggle in Type settings, as in IBM Plex. For projects that mix Cyrillic languages.",
        },
      ],
    },
  },
  converter: {
    title: "Converter",
    intro: "Add .ttf or .otf files - the whole family at once. Add OFL.txt too and it goes into the ZIP.",
    dropTitle: "Drop your fonts here",
    dropHint: "Files are not uploaded anywhere. Everything happens in your browser.",
    choose: "Choose files",
    clear: "Clear",
    noscript: "The converter needs JavaScript and WebAssembly. Turn them on in your browser.",
    runtime: {
      idle: "Preparing the converter…",
      loadingPython: "Getting the converter ready (once, about 10 MB)…",
      loadingPackages: "Loading fontTools and langBG…",
      ready: "The converter is ready.",
      file: "File {done} of {total}: {name}",
      error: "The converter didn’t load ({message}). Reload the page.",
      skipped: "Skipped files (not fonts): {names}",
    },
    report: {
      license: "License: {name}",
      analyzing: "Checking the font…",
      family: "Family",
      designer: "Designer",
      bulgarianForms: "Bulgarian forms",
      bulgarianFormsValue: "yes, {count} letters",
      letters: "Letters that change",
      kind: "Type",
      kindVariable: "variable",
      kindStatic: "static",
      kindCff: "CFF",
      kindTrueType: "TrueType",
      ssInFont: "Stylistic sets in this font",
      ssBulgarian: "Of those, with Bulgarian forms",
      none: "none",
      ssNamed: "{tag} (“{name}”)",
      technical: "Technical details",
      scripts: "Scripts",
      lookups: "Lookups",
      lookupRules: "{kind} #{index} ({rules} rules)",
      lookupPlain: "{kind} #{index}",
    },
    warnings: {
      langsys_mismatch:
        "Script {script}: with BGR the font also turns on features other than locl (BGR only: {onlyBgr}; no language only: {onlyDefault}). Only locl is carried over, so the result may differ slightly from the original with lang=\"bg\".",
    },
    notices: {
      noBgr: "This font has no Bulgarian forms (no locl for BGR). Nothing was changed and there is nothing to convert.",
      alreadyConverted: "This font is already converted with langBG.",
      worksViaSs:
        "No conversion needed: the Bulgarian forms are in {set}. Turn it on in Type settings. Convert only to make them the default.",
      featureVariations:
        "In this variable font, the Bulgarian forms depend on its axes. They are carried over - check the result in Figma.",
      reservedName: "This font has a Reserved Font Name. The copy is for your own use - don’t redistribute it.",
    },
    name: {
      legend: "Name of the new font",
      suffixLabel: "Original name + suffix",
      suffixInput: "Suffix",
      suffixResult: "It will be called “{name}”.",
      customLabel: "Custom name",
      customInput: "Family name",
      wholeFamily: "The name applies to the whole family (files: {count}).",
      multiFamily: "These files are from different families ({families}). Convert each one separately.",
      emptySuffix: "Enter a suffix.",
      emptyName: "Enter a family name.",
    },
    advanced: {
      summary: "Advanced settings",
      stylisticLabel: "Bulgarian forms as a stylistic set",
      stylisticHelp:
        "Use it if you want the original forms to stay the default and Bulgarian forms to be a switch in Figma’s type panel (a set called “Bulgarian forms”).",
    },
    convert: { button: "Convert", busy: "Converting…" },
    results: {
      title: "Done",
      ok: "{file} → {out} (“{family}”)",
      failed: "{file}:",
      rememberTitle: "Remember",
      rememberLine: "{name} = {original}",
      rememberHow: "In Figma: “{name}”. In code: “{original}” with lang=\"bg\".",
      copy: "Copy",
      copied: "Copied",
      copyFailed: "Couldn’t copy. Select the line and copy it manually.",
      download: "Download ZIP",
      downloadHint: "The fonts, the license (if added) and README.txt.",
    },
    errors: {
      no_bgr_forms: "The font has no Bulgarian forms (no locl for BGR). Nothing was changed.",
      already_converted: "This font is already converted with langBG.",
      unsupported_font: "Can’t read this file as a font. Use .ttf or .otf - WOFF2 isn’t supported yet.",
      no_free_stylistic_set:
        "No free stylistic set (ss01–ss20 are taken). Uncheck “Bulgarian forms as a stylistic set” and convert again.",
      invalid_family_name: "The name can’t be empty or the same as the original.",
      internal_error: "Conversion stopped ({message}). Try again; if it repeats, report it on GitHub.",
      fallback: "Error: {message}",
    },
    readme: {
      heading: "{name} - made with langbg.com",
      remember: "Remember: {name} = {original}",
      basedOn: "Based on {original}{by}. Bulgarian forms turned on with langbg.com.",
      by: " by {designer}",
      figma: "In Figma, pick “{name}”.",
      code: "In code: “{original}” with lang=\"bg\" on the page. Browsers show the Bulgarian forms on their own.",
      install:
        "Installing: Windows: select the files, right-click, Install. macOS: double-click, then Install Font. Then restart Figma.",
      files: "Files:",
      license:
        "License: this font is a modified copy of {original} and stays under the license in this folder. The original name is not used in the copy’s name.",
      licenseMissing: "License: this ZIP has no license file. Add the original font’s license before you share this copy.",
      mode: "Mode: Bulgarian forms by default.",
      modeStylistic: "Mode: stylistic set {set} (“Bulgarian forms”). Turn it on in Figma’s type panel.",
    },
  },
  preview: {
    title: "Preview",
    lede: "Same font, same letters. Top: as Figma shows them. Bottom: with langBG.",
    now: "In Figma today",
    with: "With langBG",
    font: "Font",
    demoNote: "This is an example in the site’s font. Convert your own font and you’ll see it here.",
    ready: "Fonts loaded.",
    rejected: "The browser rejected the font: {message}",
  },
  install: {
    title: "How to install the font",
    steps: [
      { title: "Unzip the file", text: "Extract the files from the archive, ideally into a folder of their own." },
      {
        title: "Install the fonts",
        text: "Windows: select all the files, right-click, Install. macOS: double-click, then Install Font.",
      },
      {
        title: "Restart Figma",
        text: "Restart Figma. Figma in the browser needs the Figma Font Installer. Look for the new name, e.g. “Montserrat BG”.",
      },
    ],
  },
  handoff: {
    title: "One name for design, another for code.",
    text: [
      "In Figma you pick “Montserrat BG”; in code it stays “Montserrat”. Browsers show the Bulgarian forms on their own once the page has lang=\"bg\".",
      "For the developer:",
    ],
    cssComment: "in Figma: Montserrat BG",
    soon: "Coming soon: a Figma Dev Mode plugin. It won’t change anything in your file: it will only show the correct CSS, with the original font name and a note about lang=\"bg\".",
  },
  link: { newTab: "opens in a new tab" },
  code: {
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Selected - copy it by hand",
  },
  faq: {
    title: "Frequently asked questions",
    items: [
      {
        q: "Is it legal to modify the font?",
        a: [
          "Under the OFL, yes - the license allows modifications.",
          "If the font has a Reserved Font Name (e.g. IBM Plex), the copy is still named “<name> BG” and is for your own use - don’t redistribute it. For another name, use “Custom name”.",
        ],
      },
      {
        q: "Are my fonts uploaded?",
        a: ["No. Conversion runs in your browser. No server, no accounts, no cookies."],
      },
      {
        q: "Do my teammates need the copy too?",
        a: ["Yes - everyone who opens the file. Otherwise Figma substitutes another font."],
      },
      {
        q: "Which fonts work?",
        a: [
          "Those with Bulgarian forms in locl for BGR. langBG checks the font when you add it and tells you if there’s nothing to turn on.",
          "The [catalog](/fonts/) has ready-to-convert fonts - one click each.",
        ],
      },
      {
        q: "Is the original font changed?",
        a: ["No. langBG makes a separate copy with a new name; the original stays untouched."],
      },
      {
        q: "Why doesn’t Figma do this itself?",
        a: [
          `Figma doesn’t pass the text language to the font. The [request](${FIGMA_REQUEST}) has been open since 2021. Until Figma fixes it, langBG is the workaround.`,
        ],
      },
    ],
  },
  fonts: {
    metaTitle: "Fonts with Bulgarian Cyrillic - langBG",
    metaDescription: "Google Fonts with Bulgarian forms, ready for Figma. Most convert in your browser with one click.",
    title: "Fonts with Bulgarian Cyrillic",
    lede: "Google Fonts with drawn Bulgarian forms. One click and the font is ready for Figma. The file is fetched from GitHub and converted in your browser.",
    mockNotice: "This is a small sample of the catalog. The whole catalog is coming soon.",
    filter: {
      label: "Show",
      all: "All",
      convert: "Needs conversion",
      native: "No conversion needed",
      help: {
        convert: "You convert it with one click and get a ZIP.",
        native: "Bulgarian forms are in a stylistic set (ssXX). Turn it on in Type settings.",
      },
    },
    by: "by {designer}",
    view: "See the font",
    inFigma: "In Figma: {name}",
    nativeLabel: "Works in Figma without converting - turn on {set}",
    empty: "No fonts yet.",
    detail: {
      metaTitle: "{name} for Figma with Bulgarian forms - langBG",
      metaDescription: "{name} with Bulgarian forms in Figma. One-click conversion in your browser, {license} license.",
      metaDescriptionNative: "{name} has Bulgarian forms in {set} and works in Figma without conversion. {license} license.",
      back: "All fonts",
      testerTitle: "Your text",
      testerLabel: "Sample text",
      testerSize: "Size",
      lettersTitle: "Letters that change",
      lettersHelp: "This is how they look in “{name}” with no settings.",
      lettersHelpNative: "This is how they look in “{name}” with {set} turned on.",
      testerNote: "Preview uses lang=\"bg\" - this is how it will look in Figma after conversion.",
      testerNoteNative: "Preview uses lang=\"bg\" - this is how it will look in Figma once you turn on {set}.",
      testerLimit: "The preview has only Bulgarian and Latin letters, digits and the most common punctuation.",
      infoTitle: "About the font",
      rows: {
        figmaName: "Name in Figma",
        original: "Original",
        designer: "Designer",
        license: "License",
        styles: "Styles",
        axes: "Axes",
        source: "Source",
      },
      noAxes: "none",
      nativeHow: "In Figma: select the text → Type settings → {set}. Nothing to download.",
      get: {
        button: "Download for Figma",
        hint: "Converted fonts, the license and README.txt.",
        note: "Fetched from google/fonts and converted in your browser. No copies are stored here.",
        fetching: "Fetching from GitHub: {done} of {total}…",
        done: "“{name}.zip” is downloaded. Install the fonts and restart Figma.",
        errorTitle: "Couldn’t prepare the ZIP",
        networkError: "Couldn’t reach GitHub. Check your connection and try again.",
        httpError: "GitHub returned error {status} for “{file}”. Try again in a moment.",
        timeout: "GitHub didn’t answer in time. Try again.",
        convertError: "“{file}” could not be converted: {message}",
        help: "Or download the font from Google Fonts and add it to the converter:",
        helpSource: "Or download the font from its source and add it to the converter:",
        googleFonts: "Open in Google Fonts",
        sourceButton: "Go to the source",
        manual: "Go to the converter",
        noscript: "The download needs JavaScript. You can get the original font from Google Fonts, but the converter needs JavaScript too.",
        noscriptSource: "The download needs JavaScript. You can get the original font from its source, but the converter needs JavaScript too.",
      },
      licenseTitle: "License",
      licenseText:
        "The font is under the {license} license. You may use it, share it and modify it, as long as copies stay under the same license.",
      licenseInZip: "The license is inside the ZIP.",
      licenseLink: "Read the license",
      installLink: "How to install",
      mockNotice: "This font is from a small sample of the catalog. The whole catalog is coming soon.",
    },
  },
  about: {
    metaTitle: "About - langBG",
    metaDescription: "Who made langBG, how to get involved, and the open source it stands on.",
    title: "About",
    who: {
      title: "Who’s behind it",
      text: [
        "I’m Nedyalko Stoyanov, a Product Designer from Veliko Tarnovo.",
        "My colleagues and I work with Bulgarian Cyrillic in Figma every day, using fonts from Google Fonts. Figma doesn’t show their Bulgarian forms, and there has been no official fix for years. So I researched the problem and turned what I found into this tool, to make work between designers and developers easier.",
        "I hope langBG has a short life, because that would mean Figma has fixed the problem. Until then, langBG is here, and I’d be glad to keep building it together.",
      ],
      repo: "langBG on GitHub",
    },
    involve: {
      title: "Get involved",
      text: "langBG is free and will stay free. If it saves you time or you have an idea for making it better, find me on LinkedIn.",
      button: "Message me on LinkedIn",
    },
    credits: {
      title: "The open source langBG stands on",
      intro: "Thanks to the people behind these projects. All of them are open source.",
      items: {
        pyodide: "Python in the browser. It lets the converter run without a server.",
        fonttools: "Reads and writes the fonts; the conversion is built on it.",
        fflate: "Builds the ZIP archives you download.",
        astro: "Builds this site.",
        fonts: "The site’s fonts: Spectral and Source Sans 3.",
      },
    },
  },
  footer: {
    tagline: "A free, open source project.",
    privacy: "Your fonts never leave your computer.",
    source: "Code on GitHub",
    license: "MIT license",
  },
  notFound: {
    metaTitle: "Page not found - langBG",
    title: "This page doesn’t exist",
    text: "The address may be wrong or the page may have moved.",
    home: "Go to the home page",
  },
};

export const ui: Record<Lang, Dict> = { bg, en };
