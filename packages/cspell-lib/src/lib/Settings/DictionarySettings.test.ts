import assert from 'node:assert';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { DictionaryDefinition, DictionaryDefinitionLegacy } from '@cspell/cspell-types';
import { describe, expect, test } from 'vitest';

import { isDictionaryDefinitionInlineInternal } from '../Models/CSpellSettingsInternalDef.js';
import { isDefined } from '../util/util.js';
import { getDefaultBundledSettingsAsync } from './DefaultSettings.js';
import { createDictionaryReferenceCollection as createRefCol } from './DictionaryReferenceCollection.js';
import * as DictSettings from './DictionarySettings.js';

const __filename = fileURLToPath(import.meta.url);

const defaultSettings = await getDefaultBundledSettingsAsync();
const oc = (...params: Parameters<typeof expect.objectContaining>) => expect.objectContaining(...params);

describe('Validate DictionarySettings', () => {
    test('expects default to not be empty', () => {
        assert(defaultSettings.dictionaryDefinitions);
        const mapDefs = DictSettings.filterDictDefsToLoad(
            createRefCol(['php', 'wordsEn', 'unknown', 'en_us']),
            defaultSettings.dictionaryDefinitions,
        );
        const files = mapDefs.map((def) => def.name);
        expect(mapDefs).toHaveLength(2);
        expect(files.filter((a) => a.includes('php'))).toHaveLength(1);
        expect(files.filter((a) => a.includes('wordsEn'))).toHaveLength(0);
        expect(files.filter((a) => a.includes('en_us'))).toHaveLength(1);
        expect(files.filter((a) => a.includes('unknown'))).toHaveLength(0);
    });

    test('tests exclusions and empty ids', () => {
        const ids = [
            'php',
            'cpp', // add cpp
            'wordsEn',
            '  ', // empty entry
            'unknown',
            '!cpp', // remove cpp
            'en_us',
        ];
        const expected = ['php', 'en_us'].sort();
        assert(defaultSettings.dictionaryDefinitions);
        const mapDefs = DictSettings.filterDictDefsToLoad(createRefCol(ids), defaultSettings.dictionaryDefinitions);
        const dicts = mapDefs.map((def) => def.name).sort();
        expect(dicts).toEqual(expected);
    });

    test.each`
        ids                          | expected
        ${'!php, php, cpp, !!cpp'}   | ${'cpp'}
        ${'!php, php, !!php, !!cpp'} | ${'cpp, php'}
        ${'!!!!!!!!!!cpp, !cpp'}     | ${'cpp'}
    `('validate dictionary exclusions $ids', ({ ids, expected }: { ids: string; expected: string }) => {
        const dictIds = createRefCol(ids.split(','));
        const expectedIds = expected.split(',').map((id) => id.trim());
        assert(defaultSettings.dictionaryDefinitions);
        const mapDefs = DictSettings.filterDictDefsToLoad(dictIds, defaultSettings.dictionaryDefinitions);
        const dicts = mapDefs.map((def) => def.name).sort();
        expect(dicts).toEqual(expectedIds);
    });

    test('tests that the files exist', () => {
        assert(defaultSettings.dictionaryDefinitions);
        const defaultDicts = defaultSettings.dictionaryDefinitions;
        const dictIds = createRefCol(defaultDicts.map((def) => def.name));
        const mapDefs = DictSettings.filterDictDefsToLoad(dictIds, defaultSettings.dictionaryDefinitions);
        const access = mapDefs
            .filter((def) => !isDictionaryDefinitionInlineInternal(def))
            .map((def) => def.path)
            .filter(isDefined)
            .map((path) => fsp.access(path));
        expect(mapDefs.length).toBeGreaterThan(0);
        return Promise.all(access);
    });

    test('tests default dictionary settings have been normalized', () => {
        const { dictionaryDefinitions } = defaultSettings;
        expect(dictionaryDefinitions?.length).toBeGreaterThan(1);
        dictionaryDefinitions?.forEach((def) => {
            expect(DictSettings.isDictionaryDefinitionWithSource(def)).toBe(true);
            const isInline = isDictionaryDefinitionInlineInternal(def);
            expect(isInline || path.isAbsolute(def.path || '')).toBe(true);
        });
    });

    test('tests normalizing home dir', () => {
        const pathToConfig = pathToFileURL('./cspell.json');
        const basePath = path.join('some', 'dir', 'words.txt');
        const absolutePath = path.join(os.homedir(), basePath);
        const def: DictionaryDefinition = {
            name: 'words',
            path: path.join('~', basePath),
        };

        const nDef = DictSettings.mapDictDefToInternal(def, pathToConfig);
        expect(nDef).toEqual(
            oc({
                name: 'words',
                path: absolutePath,
                __source: pathToConfig.href,
            }),
        );

        const legacyDef: DictionaryDefinitionLegacy = {
            name: 'words',
            path: path.dirname(path.join('~', basePath)),
            file: path.basename(basePath),
        };

        const nLegacyDef = DictSettings.mapDictDefToInternal(legacyDef, pathToConfig);

        expect(nLegacyDef).toEqual(nDef);
    });

    test('Double normalize', () => {
        const configFile = pathToFileURL('./cspell.json');
        const def: DictionaryDefinition = {
            name: 'Text Dict',
            path: './words.txt',
        };

        const normalizedDef = DictSettings.mapDictDefToInternal(def, configFile);
        expect(DictSettings.isDictionaryDefinitionWithSource(normalizedDef)).toBe(true);
        expect(normalizedDef).toEqual(expect.objectContaining({ __source: configFile.href }));

        const normalizedDef2 = DictSettings.mapDictDefToInternal(normalizedDef, configFile);
        expect(normalizedDef2).toBe(normalizedDef);
    });

    test.each`
        def                                                                                                  | expected
        ${{}}                                                                                                | ${false}
        ${DictSettings.mapDictDefToInternal({ name: 'def', path: './dict.txt' }, pathToFileURL(__filename))} | ${true}
    `('isDictionaryDefinitionInternal', ({ def, expected }) => {
        expect(DictSettings.isDictionaryDefinitionInternal(def)).toBe(expected);
    });
});
