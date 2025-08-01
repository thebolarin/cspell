import type { PredefinedPatterns, RegExpPatternDefinition } from '@cspell/cspell-types';
import { parsers } from 'cspell-grammar';

import type { CSpellSettingsInternal } from '../Models/CSpellSettingsInternalDef.js';
import { createCSpellSettingsInternal } from '../Models/CSpellSettingsInternalDef.js';
import { PatternRegExp } from '../Models/PatternRegExp.js';
import { srcDirectory } from '../pkg-info.mjs';
import { resolveFile } from '../util/resolveFile.js';
import { defaultConfigFileModuleRef } from './constants.js';
import { readSettings } from './Controller/configLoader/index.js';
import { mergeSettings } from './CSpellSettingsServer.js';
import * as LanguageSettings from './LanguageSettings.js';
import * as RegPat from './RegExpPatterns.js';

// Do not use require.resolve because webpack will mess it up.
const defaultConfigFile = () => resolveConfigModule(defaultConfigFileModuleRef);

const regExpSpellCheckerDisable = [
    new PatternRegExp(RegPat.regExSpellingGuardBlock),
    new PatternRegExp(RegPat.regExSpellingGuardLine),
    new PatternRegExp(RegPat.regExSpellingGuardNext),
];

// cspell:ignore filetypes
const predefinedPatterns = [
    // Exclude patterns
    { name: 'CommitHash', pattern: RegPat.regExCommitHash },
    { name: 'CommitHashLink', pattern: RegPat.regExCommitHashLink },
    { name: 'CStyleHexValue', pattern: RegPat.regExCStyleHexValue },
    { name: 'CSSHexValue', pattern: RegPat.regExCSSHexValue },
    { name: 'Urls', pattern: RegPat.regExMatchUrls },
    { name: 'HexValues', pattern: RegPat.regExMatchCommonHexFormats },
    { name: 'SpellCheckerDisable', pattern: regExpSpellCheckerDisable },
    { name: 'PublicKey', pattern: RegPat.regExPublicKey },
    { name: 'RsaCert', pattern: RegPat.regExCert },
    { name: 'SshRsa', pattern: RegPat.regExSshRSA },
    { name: 'EscapeCharacters', pattern: RegPat.regExEscapeCharacters },
    { name: 'Base64', pattern: RegPat.regExBase64 },
    { name: 'Base64SingleLine', pattern: RegPat.regExBase64SingleLine },
    { name: 'Base64MultiLine', pattern: RegPat.regExBase64MultiLine },
    { name: 'Email', pattern: RegPat.regExEmail },
    { name: 'SHA', pattern: RegPat.regExSha },
    { name: 'HashStrings', pattern: RegPat.regExHashStrings },
    { name: 'UnicodeRef', pattern: RegPat.regExUnicodeRef },
    { name: 'UUID', pattern: RegPat.regExUUID },
    { name: 'href', pattern: RegPat.regExHRef },
    { name: 'SpellCheckerDisableBlock', pattern: RegPat.regExSpellingGuardBlock },
    { name: 'SpellCheckerDisableLine', pattern: RegPat.regExSpellingGuardLine },
    { name: 'SpellCheckerDisableNext', pattern: RegPat.regExSpellingGuardNext },
    { name: 'SpellCheckerIgnoreInDocSetting', pattern: RegPat.regExIgnoreSpellingDirectives },

    // Include Patterns
    { name: 'PhpHereDoc', pattern: RegPat.regExPhpHereDoc },
    { name: 'string', pattern: RegPat.regExString },
    { name: 'CStyleComment', pattern: RegPat.regExCStyleComments },
    { name: 'Everything', pattern: '.*' },
] as const;

type NameType<T> = T extends readonly { name: infer U }[] ? U : never;

type ExtendsType<T, U> = T extends U ? T : never;

type PredefinedPatternNames = ExtendsType<NameType<typeof predefinedPatterns>, PredefinedPatterns>;

const defaultRegExpPatterns: RegExpPatternDefinition[] = [...predefinedPatterns].map(normalizePattern);

const definedDefaultRegExpExcludeList: PredefinedPatterns[] = [
    'SpellCheckerDisable',
    'SpellCheckerIgnoreInDocSetting',
    'Urls',
    'Email',
    'RsaCert',
    'SshRsa',
    'Base64MultiLine',
    'Base64SingleLine',
    'CommitHash',
    'CommitHashLink',
    'CStyleHexValue',
    'CSSHexValue',
    'SHA',
    'HashStrings',
    'UnicodeRef',
    'UUID',
];

// This bit of copying is done to have the compiler ensure that the defaults exist.
const defaultRegExpExcludeList: PredefinedPatternNames[] = definedDefaultRegExpExcludeList;

export const _defaultSettingsBasis: Readonly<CSpellSettingsInternal> = Object.freeze(
    createCSpellSettingsInternal({
        id: 'static_defaults',
        language: 'en',
        name: 'Static Defaults',
        enabled: true,
        enabledLanguageIds: [],
        maxNumberOfProblems: 100,
        numSuggestions: 10,
        suggestionsTimeout: 500,
        suggestionNumChanges: 3,
        words: [],
        userWords: [],
        ignorePaths: [],
        allowCompoundWords: false,
        patterns: defaultRegExpPatterns,
        ignoreRegExpList: [],
        languageSettings: [],
        source: { name: 'defaultSettings' },
        reporters: [],
        plugins: [{ parsers }],
    }),
);

export const _defaultSettings: Readonly<CSpellSettingsInternal> = Object.freeze(
    createCSpellSettingsInternal({
        ..._defaultSettingsBasis,
        enabledFileTypes: { '*': true },
        ignoreRegExpList: defaultRegExpExcludeList,
        languageSettings: LanguageSettings.getDefaultLanguageSettings(),
    }),
);

async function resolveConfigModule(configModuleName: string) {
    return (await resolveFile(configModuleName, srcDirectory)).filename;
}

function normalizePattern(pat: RegExpPatternDefinition): RegExpPatternDefinition {
    const { name, pattern, description } = pat;
    if (!(pattern instanceof RegExp)) return pat;

    return {
        name,
        pattern: new PatternRegExp(pattern),
        description,
    };
}

class DefaultSettingsLoader {
    settings: CSpellSettingsInternal | undefined = undefined;
    pending: Promise<CSpellSettingsInternal> | undefined = undefined;

    constructor() {
        // start loading.
        this.getDefaultSettingsAsync().catch(() => undefined);
    }

    getDefaultSettingsAsync(useDefaultDictionaries = true): Promise<CSpellSettingsInternal> {
        if (!useDefaultDictionaries) {
            return Promise.resolve(_defaultSettingsBasis);
        }
        if (this.settings) return Promise.resolve(this.settings);
        if (this.pending) return this.pending;

        this.pending = (async () => {
            const defaultConfigLocation = await defaultConfigFile();
            const jsonSettings = await readSettings(defaultConfigLocation);
            this.settings = mergeSettings(_defaultSettings, jsonSettings);
            if (jsonSettings.name !== undefined) {
                this.settings.name = jsonSettings.name;
            } else {
                delete this.settings.name;
            }
            return this.settings;
        })();
        return this.pending;
    }
}

export const defaultSettingsLoader: DefaultSettingsLoader = new DefaultSettingsLoader();

export function getDefaultSettings(useDefaultDictionaries = true): Promise<CSpellSettingsInternal> {
    return defaultSettingsLoader.getDefaultSettingsAsync(useDefaultDictionaries);
}

export function getDefaultBundledSettingsAsync(): Promise<CSpellSettingsInternal> {
    return defaultSettingsLoader.getDefaultSettingsAsync();
}
