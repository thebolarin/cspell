import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CSpellSettings, CSpellUserSettings, ImportFileRef, Source } from '@cspell/cspell-types';
import { CSpellConfigFile, CSpellConfigFileReaderWriter, ICSpellConfigFile, IO, TextFile } from 'cspell-config-lib';
import { createReaderWriter } from 'cspell-config-lib';
import { isUrlLike, toFileURL } from 'cspell-io';
import { URI, Utils as UriUtils } from 'vscode-uri';

import { onClearCache } from '../../../events/index.js';
import type { VFileSystem } from '../../../fileSystem.js';
import { getVirtualFS } from '../../../fileSystem.js';
import { createCSpellSettingsInternal as csi } from '../../../Models/CSpellSettingsInternalDef.js';
import { srcDirectory } from '../../../pkg-info.mjs';
import { autoResolve, AutoResolveCache, autoResolveWeak, CacheStats } from '../../../util/AutoResolve.js';
import { logError, logWarning } from '../../../util/logger.js';
import { FileResolver } from '../../../util/resolveFile.js';
import { envToTemplateVars } from '../../../util/templates.js';
import {
    addTrailingSlash,
    cwdURL,
    resolveFileWithURL,
    toFileDirURL,
    toFilePathOrHref,
    toFileUrl,
    windowsDriveLetterToUpper,
} from '../../../util/url.js';
import {
    configSettingsFileVersion0_1,
    configSettingsFileVersion0_2,
    currentSettingsFileVersion,
    defaultConfigFileModuleRef,
    ENV_CSPELL_GLOB_ROOT,
} from '../../constants.js';
import { getMergeStats, mergeSettings } from '../../CSpellSettingsServer.js';
import { getGlobalConfig } from '../../GlobalSettings.js';
import { ImportError } from '../ImportError.js';
import type { LoaderResult } from '../pnpLoader.js';
import { pnpLoader } from '../pnpLoader.js';
import { searchPlaces } from './configLocations.js';
import { ConfigSearch } from './configSearch.js';
import { configToRawSettings } from './configToRawSettings.js';
import { StopSearchAt } from './defaultConfigLoader.js';
import { defaultSettings } from './defaultSettings.js';
import {
    normalizeCacheSettings,
    normalizeDictionaryDefs,
    normalizeGitignoreRoot,
    normalizeImport,
    normalizeLanguageSettings,
    normalizeOverrides,
    normalizeReporters,
    normalizeSettingsGlobs,
} from './normalizeRawSettings.js';
import type { PnPSettingsOptional } from './PnPSettings.js';
import { defaultPnPSettings, normalizePnPSettings } from './PnPSettings.js';
import type { CSpellSettingsI, CSpellSettingsWST } from './types.js';

type CSpellSettingsVersion = Exclude<CSpellUserSettings['version'], undefined>;
const supportedCSpellConfigVersions: CSpellSettingsVersion[] = [configSettingsFileVersion0_2];

const setOfSupportedConfigVersions = Object.freeze(new Set<string>(supportedCSpellConfigVersions));

export const sectionCSpell = 'cSpell';

export const defaultFileName = 'cspell.json';

interface ImportedConfigEntry {
    /** href of the configFile URL, this is the key to the cache. */
    href: string;
    /** The fileRef used. */
    fileRef: ImportFileRef;
    /** resolved config file */
    configFile: CSpellConfigFile | undefined;
    /** resolved settings */
    settings: CSpellSettingsI | undefined;
    isReady: boolean;
    /** Resolved when the settings have been fully resolved. */
    onReady: Promise<CSpellSettingsI>;
    /** Resolved when the config file has been loaded. */
    onConfigFileReady: Promise<CSpellConfigFile | Error>;
    /** Set of all references used to catch circular references */
    referencedSet: Set<string>;
}

export interface SearchForConfigFileOptions {
    stopSearchAt?: StopSearchAt;
}

export interface SearchForConfigOptions extends SearchForConfigFileOptions, PnPSettingsOptional {}

let defaultConfigLoader: ConfigLoaderInternal | undefined = undefined;

interface CacheMergeConfigFileWithImports {
    // cfgFile: CSpellConfigFile;
    pnpSettings: PnPSettingsOptional | undefined;
    referencedBy: string[] | undefined;
    result: Promise<CSpellSettingsI>;
}

export interface IConfigLoader {
    readSettingsAsync(
        filename: string | URL,
        relativeTo?: string | URL,
        pnpSettings?: PnPSettingsOptional,
    ): Promise<CSpellSettingsI>;

    /**
     * Read a cspell configuration file.
     * @param filenameOrURL - URL, relative path, absolute path, or package name.
     * @param relativeTo - optional URL, defaults to `pathToFileURL('./')`
     */
    readConfigFile(filenameOrURL: string | URL, relativeTo?: string | URL): Promise<CSpellConfigFile | Error>;

    searchForConfigFileLocation(searchFrom: URL | string | undefined): Promise<URL | undefined>;

    searchForConfigFile(searchFrom: URL | string | undefined): Promise<CSpellConfigFile | undefined>;

    /**
     * This is an alias for `searchForConfigFile` and `mergeConfigFileWithImports`.
     * @param searchFrom the directory / file URL to start searching from.
     * @param options - Optional settings including stop location and Yarn PnP configuration.
     * @returns the resulting settings
     */
    searchForConfig(
        searchFrom: URL | string | undefined,
        options?: SearchForConfigOptions,
    ): Promise<CSpellSettingsI | undefined>;

    resolveConfigFileLocation(filenameOrURL: string | URL, relativeTo?: string | URL): Promise<URL | undefined>;

    getGlobalSettingsAsync(): Promise<CSpellSettingsI>;

    /**
     * The loader caches configuration files for performance. This method clears the cache.
     */
    clearCachedSettingsFiles(): void;

    /**
     * Resolve and merge the settings from the imports.
     * This will create a virtual configuration file that is used to resolve the settings.
     * @param settings - settings to resolve imports for
     * @param filename - the path / URL to the settings file. Used to resolve imports.
     */
    resolveSettingsImports(settings: CSpellUserSettings, filename: string | URL): Promise<CSpellSettingsI>;

    /**
     * Resolve imports and merge.
     * @param cfgFile - configuration file.
     * @param pnpSettings - optional settings related to Using Yarn PNP.
     */
    mergeConfigFileWithImports(
        cfgFile: CSpellConfigFile,
        pnpSettings?: PnPSettingsOptional | undefined,
    ): Promise<CSpellSettingsI>;

    /**
     * Create an in memory CSpellConfigFile.
     * @param filename - URL to the file. Used to resolve imports.
     * @param settings - settings to use.
     */
    createCSpellConfigFile(filename: URL | string, settings: CSpellUserSettings): CSpellConfigFile;

    /**
     * Convert a ICSpellConfigFile into a CSpellConfigFile.
     * If cfg is a CSpellConfigFile, it is returned as is.
     * @param cfg - configuration file to convert.
     */
    toCSpellConfigFile(cfg: ICSpellConfigFile): CSpellConfigFile;

    /**
     * Unsubscribe from any events and dispose of any resources including caches.
     */
    dispose(): void;

    getStats(): Readonly<Record<string, Readonly<Record<string, number>>>>;

    readonly isTrusted: boolean;

    setIsTrusted(isTrusted: boolean): void;
}

const defaultExtensions = ['.json', '.yaml', '.yml', '.jsonc'];
const defaultJsExtensions = ['.js', '.cjs', '.mjs'];

const trustedSearch: Map<string, readonly string[]> = new Map([
    ['*', defaultExtensions],
    ['file:', [...defaultExtensions, ...defaultJsExtensions]],
]);

const unTrustedSearch: Map<string, readonly string[]> = new Map([['*', defaultExtensions]]);

export class ConfigLoader implements IConfigLoader {
    public onReady: Promise<void>;
    readonly fileResolver: FileResolver;
    private _isTrusted = true;

    /**
     * Use `createConfigLoader`
     * @param virtualFs - virtual file system to use.
     */
    protected constructor(
        readonly fs: VFileSystem,
        readonly templateVariables: Record<string, string> = envToTemplateVars(process.env),
    ) {
        this.configSearch = new ConfigSearch(searchPlaces, trustedSearch, fs);
        this.cspellConfigFileReaderWriter = createReaderWriter(undefined, undefined, createIO(fs));
        this.fileResolver = new FileResolver(fs, this.templateVariables);
        this.onReady = this.init();
        this.subscribeToEvents();
    }

    private subscribeToEvents() {
        this.toDispose.push(onClearCache(() => this.clearCachedSettingsFiles()));
    }

    protected cachedConfig: Map<string, ImportedConfigEntry> = new Map();
    protected cachedConfigFiles: Map<string, CSpellConfigFile> = new Map();
    protected cachedPendingConfigFile: AutoResolveCache<string, Promise<Error | CSpellConfigFile>> =
        new AutoResolveCache();
    protected cachedMergedConfig: WeakMap<CSpellConfigFile, CacheMergeConfigFileWithImports> = new WeakMap();
    protected cachedCSpellConfigFileInMemory: WeakMap<CSpellSettings, Map<string, CSpellConfigFile>> = new WeakMap();
    protected globalSettings: CSpellSettingsI | undefined;
    protected cspellConfigFileReaderWriter: CSpellConfigFileReaderWriter;
    protected configSearch: ConfigSearch;
    protected stopSearchAtCache: WeakMap<SearchForConfigFileOptions, URL[] | undefined> = new WeakMap();

    protected toDispose: { dispose: () => void }[] = [];

    public async readSettingsAsync(
        filename: string | URL,
        relativeTo?: string | URL,
        pnpSettings?: PnPSettingsOptional,
    ): Promise<CSpellSettingsI> {
        await this.onReady;
        const ref = await this.resolveFilename(filename, relativeTo || toFileDirURL('./'));
        const entry = this.importSettings(ref, pnpSettings || defaultPnPSettings, []);
        return entry.onReady;
    }

    public async readConfigFile(
        filenameOrURL: string | URL,
        relativeTo?: string | URL,
    ): Promise<CSpellConfigFile | Error> {
        const ref = await this.resolveFilename(filenameOrURL.toString(), relativeTo || toFileDirURL('./'));
        const url = toFileURL(ref.filename);
        const href = url.href;
        if (ref.error) return new ImportError(`Failed to read config file: "${ref.filename}"`, ref.error);
        const cached = this.cachedConfigFiles.get(href);
        if (cached) return cached;
        return this.cachedPendingConfigFile.get(href, async () => {
            try {
                const file = await this.cspellConfigFileReaderWriter.readConfig(href);
                this.cachedConfigFiles.set(href, file);
                // validateRawConfigVersion(file);
                return file;
            } catch (error) {
                // console.warn('Debug: %o', { href, error });
                return new ImportError(`Failed to read config file: "${ref.filename}"`, error);
            } finally {
                setTimeout(() => this.cachedPendingConfigFile.delete(href), 1);
            }
        });
    }

    async searchForConfigFileLocation(
        searchFrom: URL | string | undefined,
        stopSearchAt?: URL[] | undefined,
    ): Promise<URL | undefined> {
        const searchFromURL = (await this.#normalizeDirURL(searchFrom)) || cwdURL();
        return this.configSearch.searchForConfig(searchFromURL, stopSearchAt);
    }

    async searchForConfigFile(
        searchFrom: URL | string | undefined,
        stopSearchAt?: URL[],
    ): Promise<CSpellConfigFile | undefined> {
        const location = await this.searchForConfigFileLocation(searchFrom, stopSearchAt);
        if (!location) return undefined;
        const file = await this.readConfigFile(location);
        return file instanceof Error ? undefined : file;
    }

    /**
     *
     * @param searchFrom the directory / file URL to start searching from.
     * @param options - Optional settings including stop location and Yarn PnP configuration.
     * @returns the resulting settings
     */
    async searchForConfig(
        searchFrom: URL | string | undefined,
        options?: SearchForConfigOptions,
    ): Promise<CSpellSettingsI | undefined> {
        const stopAt = await this.#extractStopSearchAtURLs(options);
        const configFile = await this.searchForConfigFile(searchFrom, stopAt);
        if (!configFile) return undefined;

        return this.mergeConfigFileWithImports(configFile, options);
    }

    public getGlobalSettings(): CSpellSettingsI {
        assert(this.globalSettings, 'Global settings not loaded');
        return this.globalSettings;
    }

    public async getGlobalSettingsAsync(): Promise<CSpellSettingsI> {
        if (!this.globalSettings) {
            const globalConfFile = await getGlobalConfig();
            const normalized = await this.mergeConfigFileWithImports(globalConfFile, undefined);
            normalized.id ??= 'global_config';
            this.globalSettings = normalized;
        }
        return this.globalSettings;
    }

    public clearCachedSettingsFiles(): void {
        this.globalSettings = undefined;
        this.cachedConfig.clear();
        this.cachedConfigFiles.clear();
        this.configSearch.clearCache();
        this.cachedPendingConfigFile.clear();
        this.cspellConfigFileReaderWriter.clearCachedFiles();
        this.cachedMergedConfig = new WeakMap();
        this.cachedCSpellConfigFileInMemory = new WeakMap();
        this.prefetchGlobalSettingsAsync();
    }

    /**
     * Resolve and merge the settings from the imports.
     * @param settings - settings to resolve imports for
     * @param filename - the path / URL to the settings file. Used to resolve imports.
     */
    resolveSettingsImports(settings: CSpellUserSettings, filename: string | URL): Promise<CSpellSettingsI> {
        const settingsFile = this.createCSpellConfigFile(filename, settings);
        return this.mergeConfigFileWithImports(settingsFile, settings);
    }

    protected init(): Promise<void> {
        this.onReady = Promise.all([this.prefetchGlobalSettingsAsync(), this.resolveDefaultConfig()]).then(
            () => undefined,
        );
        return this.onReady;
    }

    protected async prefetchGlobalSettingsAsync(): Promise<void> {
        await this.getGlobalSettingsAsync().catch((e) => logError(e));
    }

    protected async resolveDefaultConfig(): Promise<URL> {
        const r = await this.fileResolver.resolveFile(defaultConfigFileModuleRef, srcDirectory);
        const url = toFileURL(r.filename);
        this.cspellConfigFileReaderWriter.setTrustedUrls([new URL('../..', url)]);
        return url;
    }

    protected importSettings(
        fileRef: ImportFileRef,
        pnpSettings: PnPSettingsOptional | undefined,
        backReferences: string[],
    ): ImportedConfigEntry {
        const url = toFileURL(fileRef.filename);
        const cacheKey = url.href;
        const cachedImport = this.cachedConfig.get(cacheKey);
        if (cachedImport) {
            backReferences.forEach((ref) => cachedImport.referencedSet.add(ref));
            return cachedImport;
        }

        if (fileRef.error) {
            const settings = csi({
                __importRef: fileRef,
                source: { name: fileRef.filename, filename: fileRef.filename },
            });
            const importedConfig: ImportedConfigEntry = {
                href: cacheKey,
                fileRef,
                configFile: undefined,
                settings,
                isReady: true,
                onReady: Promise.resolve(settings),
                onConfigFileReady: Promise.resolve(fileRef.error),
                referencedSet: new Set(backReferences),
            };
            this.cachedConfig.set(cacheKey, importedConfig);
            return importedConfig;
        }

        const source: Source = {
            name: fileRef.filename,
            filename: fileRef.filename,
        };

        const mergeImports = (cfgFile: CSpellConfigFile | Error) => {
            if (cfgFile instanceof Error) {
                fileRef.error = cfgFile;
                return csi({ __importRef: fileRef, source });
            }
            return this.mergeConfigFileWithImports(cfgFile, pnpSettings, backReferences);
        };

        const referencedSet = new Set(backReferences);
        const onConfigFileReady = onConfigFileReadyFixUp(this.readConfigFile(fileRef.filename));

        const importedConfig: ImportedConfigEntry = {
            href: cacheKey,
            fileRef,
            configFile: undefined,
            settings: undefined,
            isReady: false,
            onReady: onReadyFixUp(onConfigFileReady.then(mergeImports)),
            onConfigFileReady,
            referencedSet,
        };

        this.cachedConfig.set(cacheKey, importedConfig);
        return importedConfig;

        async function onReadyFixUp(pSettings: Promise<CSpellSettingsI>): Promise<CSpellSettingsI> {
            const settings = await pSettings;
            settings.source ??= source;
            settings.__importRef ??= fileRef;
            importedConfig.isReady = true;
            importedConfig.settings = settings;
            return settings;
        }

        async function onConfigFileReadyFixUp(
            pCfgFile: Promise<CSpellConfigFile | Error>,
        ): Promise<CSpellConfigFile | Error> {
            const cfgFile = await pCfgFile;
            if (cfgFile instanceof Error) {
                importedConfig.fileRef.error = cfgFile;
                return cfgFile;
            }
            source.name = cfgFile.settings.name || source.name;
            importedConfig.configFile = cfgFile;
            return cfgFile;
        }
    }

    private async setupPnp(cfgFile: CSpellConfigFile, pnpSettings: PnPSettingsOptional | undefined) {
        if (!pnpSettings?.usePnP || pnpSettings === defaultPnPSettings) return;
        if (cfgFile.url.protocol !== 'file:') return;

        // Try to load any .pnp files before reading dictionaries or other config files.
        const { usePnP = pnpSettings.usePnP, pnpFiles = pnpSettings.pnpFiles } = cfgFile.settings;
        const pnpSettingsToUse: PnPSettingsOptional = normalizePnPSettings({ usePnP, pnpFiles });
        const pathToSettingsDir = new URL('.', cfgFile.url);
        await loadPnP(pnpSettingsToUse, pathToSettingsDir);
    }

    public mergeConfigFileWithImports(
        cfg: CSpellConfigFile | ICSpellConfigFile,
        pnpSettings: PnPSettingsOptional | undefined,
        referencedBy?: string[] | undefined,
    ): Promise<CSpellSettingsI> {
        const cfgFile = this.toCSpellConfigFile(cfg);
        const cached = this.cachedMergedConfig.get(cfgFile);
        if (cached && cached.pnpSettings === pnpSettings && cached.referencedBy === referencedBy) {
            return cached.result;
        }
        // console.warn('missing cache %o', cfgFile.url.href);

        const pnp: PnPSettingsOptional = {
            usePnP: cfg.settings.usePnP ?? pnpSettings?.usePnP ?? !!process.versions.pnp,
            pnpFiles: cfg.settings.pnpFiles ?? pnpSettings?.pnpFiles,
        };

        const result = this._mergeConfigFileWithImports(cfgFile, pnp, referencedBy);
        this.cachedMergedConfig.set(cfgFile, { pnpSettings, referencedBy, result });
        return result;
    }

    private async _mergeConfigFileWithImports(
        cfgFile: CSpellConfigFile,
        pnpSettings: PnPSettingsOptional | undefined,
        referencedBy: string[] = [],
    ): Promise<CSpellSettingsI> {
        await this.setupPnp(cfgFile, pnpSettings);

        const href = cfgFile.url.href;

        const referencedSet = new Set(referencedBy);
        const imports = normalizeImport(cfgFile.settings.import);

        const __imports = await Promise.all(imports.map((name) => this.resolveFilename(name, cfgFile.url)));

        const toImport = __imports.map((ref) => this.importSettings(ref, pnpSettings, [...referencedBy, href]));

        // Add ourselves to the import sources.
        toImport.forEach((entry) => {
            entry.referencedSet.add(href);
        });

        const pendingImports: (Promise<CSpellSettingsI> | CSpellUserSettings)[] = toImport.map((entry) => {
            // Detect circular references, return raw settings if circular.
            return referencedSet.has(entry.href)
                ? entry.settings || configToRawSettings(entry.configFile)
                : entry.onReady;
        });

        const importSettings = await Promise.all(pendingImports);
        const cfg = await this.mergeImports(cfgFile, importSettings);
        return cfg;
    }

    /**
     * normalizeSettings handles correcting all relative paths, anchoring globs, and importing other config files.
     * @param rawSettings - raw configuration settings
     * @param pathToSettingsFile - path to the source file of the configuration settings.
     */
    protected async mergeImports(
        cfgFile: CSpellConfigFile,
        importedSettings: CSpellUserSettings[],
    ): Promise<CSpellSettingsI> {
        const rawSettings = configToRawSettings(cfgFile);

        const url = cfgFile.url;
        const fileRef = rawSettings.__importRef;
        const source = rawSettings.source;

        assert(source);

        // Fix up dictionaryDefinitions
        const settings = {
            version: defaultSettings.version,
            ...rawSettings,
            globRoot: resolveGlobRoot(rawSettings, cfgFile.url),
            languageSettings: normalizeLanguageSettings(rawSettings.languageSettings),
        };

        const normalizedDictionaryDefs = normalizeDictionaryDefs(settings, url);
        const normalizedSettingsGlobs = normalizeSettingsGlobs(settings, url);
        const normalizedOverrides = normalizeOverrides(settings, url);
        const normalizedReporters = await normalizeReporters(settings, url);
        const normalizedGitignoreRoot = normalizeGitignoreRoot(settings, url);
        const normalizedCacheSettings = normalizeCacheSettings(settings, url);

        const fileSettings: CSpellSettingsI = csi({
            ...settings,
            source,
            ...normalizedDictionaryDefs,
            ...normalizedSettingsGlobs,
            ...normalizedOverrides,
            ...normalizedReporters,
            ...normalizedGitignoreRoot,
            ...normalizedCacheSettings,
        } as Partial<CSpellSettingsI>);
        if (!importedSettings.length) {
            return fileSettings;
        }

        const mergedImportedSettings = importedSettings.reduce((a, b) => mergeSettings(a, b));
        const finalizeSettings = mergeSettings(mergedImportedSettings, fileSettings);
        finalizeSettings.name = settings.name || finalizeSettings.name || '';
        finalizeSettings.id = settings.id || finalizeSettings.id || '';
        if (fileRef) {
            finalizeSettings.__importRef = fileRef;
        }
        return finalizeSettings;
    }

    createCSpellConfigFile(filename: URL | string, settings: CSpellUserSettings): CSpellConfigFile {
        const map = autoResolveWeak(
            this.cachedCSpellConfigFileInMemory,
            settings,
            () => new Map<string, CSpellConfigFile>(),
        );
        return autoResolve(map, filename, () =>
            this.cspellConfigFileReaderWriter.toCSpellConfigFile({ url: toFileURL(filename), settings }),
        );
    }

    toCSpellConfigFile(cfg: ICSpellConfigFile): CSpellConfigFile {
        if (cfg instanceof CSpellConfigFile) return cfg;
        return this.createCSpellConfigFile(cfg.url, cfg.settings);
    }

    dispose(): void {
        while (this.toDispose.length) {
            try {
                this.toDispose.pop()?.dispose();
            } catch (e) {
                logError(e);
            }
        }
    }

    getStats(): {
        cacheMergeListUnique: Readonly<CacheStats>;
        cacheMergeLists: Readonly<CacheStats>;
    } {
        return { ...getMergeStats() };
    }

    async resolveConfigFileLocation(filenameOrURL: string | URL, relativeTo: string | URL): Promise<URL | undefined> {
        const r = await this.fileResolver.resolveFile(filenameOrURL, relativeTo);
        return r.found ? toFileURL(r.filename) : undefined;
    }

    private async resolveFilename(filename: string | URL, relativeTo: string | URL): Promise<ImportFileRef> {
        if (filename instanceof URL) return { filename: toFilePathOrHref(filename) };
        if (isUrlLike(filename)) return { filename: toFilePathOrHref(filename) };

        const r = await this.fileResolver.resolveFile(filename, relativeTo);

        if (r.warning) {
            logWarning(r.warning);
        }

        return {
            filename: r.filename.startsWith('file:/') ? fileURLToPath(r.filename) : r.filename,
            error: r.found ? undefined : new ConfigurationLoaderFailedToResolveError(filename, relativeTo),
        };
    }

    get isTrusted(): boolean {
        return this._isTrusted;
    }

    setIsTrusted(isTrusted: boolean): void {
        this._isTrusted = isTrusted;
        this.clearCachedSettingsFiles();
        this.configSearch = new ConfigSearch(searchPlaces, isTrusted ? trustedSearch : unTrustedSearch, this.fs);
        this.cspellConfigFileReaderWriter.setUntrustedExtensions(isTrusted ? [] : defaultJsExtensions);
    }

    async #extractStopSearchAtURLs(options: SearchForConfigOptions | undefined): Promise<URL[] | undefined> {
        if (!options?.stopSearchAt) return undefined;

        if (this.stopSearchAtCache.has(options)) {
            return this.stopSearchAtCache.get(options);
        }

        const rawStops = Array.isArray(options.stopSearchAt) ? options.stopSearchAt : [options.stopSearchAt];
        const stopURLs = await Promise.all(rawStops.map((s) => this.#normalizeDirURL(s)));

        this.stopSearchAtCache.set(options, stopURLs);
        return stopURLs;
    }

    async #normalizeDirURL(input: URL | string): Promise<URL>;
    async #normalizeDirURL(input: URL | string | undefined): Promise<URL | undefined>;
    async #normalizeDirURL(input: URL | string | undefined): Promise<URL | undefined> {
        if (!input) return undefined;
        const url = toFileURL(input, cwdURL());
        if (url.pathname.endsWith('/')) return url;
        if (input instanceof URL) return new URL('.', url);
        if (
            typeof input === 'string' &&
            !isUrlLike(input) &&
            url.protocol === 'file:' &&
            (await isDirectory(this.fs, url))
        ) {
            return addTrailingSlash(url);
        }
        return new URL('.', url);
    }
}

class ConfigLoaderInternal extends ConfigLoader {
    constructor(vfs: VFileSystem) {
        super(vfs);
    }

    get _cachedFiles(): Map<string, ImportedConfigEntry> {
        return this.cachedConfig;
    }
}

export function loadPnP(pnpSettings: PnPSettingsOptional, searchFrom: URL): Promise<LoaderResult> {
    if (!pnpSettings.usePnP) {
        return Promise.resolve(undefined);
    }
    const loader = pnpLoader(pnpSettings.pnpFiles);
    return loader.load(searchFrom);
}

const nestedConfigDirectories: Record<string, true> = {
    '.vscode': true,
    '.config': true, // this should be removed in the future, but it is a breaking change.
};

function resolveGlobRoot(settings: CSpellSettingsWST, urlSettingsFile: URL): string {
    const urlSettingsFileDir = new URL('.', urlSettingsFile);
    const uriSettingsFileDir = URI.parse(urlSettingsFileDir.href);

    const settingsFileDirName = UriUtils.basename(uriSettingsFileDir);

    const isNestedConfig = settingsFileDirName in nestedConfigDirectories;
    const isVSCode = settingsFileDirName === '.vscode';
    const settingsFileDir = (isNestedConfig ? UriUtils.dirname(uriSettingsFileDir) : uriSettingsFileDir).toString();
    const envGlobRoot = process.env[ENV_CSPELL_GLOB_ROOT];
    const defaultGlobRoot = envGlobRoot ?? '${cwd}';
    const rawRoot =
        settings.globRoot ??
        (settings.version === configSettingsFileVersion0_1 ||
        (envGlobRoot && !settings.version) ||
        (isVSCode && !settings.version)
            ? defaultGlobRoot
            : settingsFileDir);

    const globRoot = rawRoot.startsWith('${cwd}') ? rawRoot : resolveFileWithURL(rawRoot, new URL(settingsFileDir));

    return typeof globRoot === 'string'
        ? globRoot
        : globRoot.protocol === 'file:'
          ? windowsDriveLetterToUpper(path.resolve(fileURLToPath(globRoot)))
          : addTrailingSlash(globRoot).href;
}

function validationMessage(msg: string, url: URL) {
    return msg + `\n  File: "${toFilePathOrHref(url)}"`;
}

function validateRawConfigVersion(config: CSpellConfigFile): void {
    const { version } = config.settings;

    if (version === undefined) return;

    if (typeof version !== 'string') {
        logError(validationMessage(`Unsupported config file version: "${version}", string expected`, config.url));
        return;
    }

    if (setOfSupportedConfigVersions.has(version)) return;

    if (!/^\d+(\.\d+)*$/.test(version)) {
        logError(validationMessage(`Unsupported config file version: "${version}"`, config.url));
        return;
    }

    const msg =
        version > currentSettingsFileVersion
            ? `Newer config file version found: "${version}". Supported version is "${currentSettingsFileVersion}"`
            : `Legacy config file version found: "${version}", upgrade to "${currentSettingsFileVersion}"`;

    logWarning(validationMessage(msg, config.url));
}

function createConfigLoaderInternal(fs?: VFileSystem) {
    return new ConfigLoaderInternal(fs ?? getVirtualFS().fs);
}

export function createConfigLoader(fs?: VFileSystem): IConfigLoader {
    return createConfigLoaderInternal(fs);
}

export function getDefaultConfigLoaderInternal(): ConfigLoaderInternal {
    if (defaultConfigLoader) return defaultConfigLoader;

    return (defaultConfigLoader = createConfigLoaderInternal());
}

function createIO(fs: VFileSystem): IO {
    const readFile = (url: URL) => fs.readFile(url).then((file) => ({ url: file.url, content: file.getText() }));
    const writeFile = (file: TextFile) => fs.writeFile(file);
    return {
        readFile,
        writeFile,
    };
}

async function isDirectory(fs: VFileSystem, path: URL): Promise<boolean> {
    try {
        return (await fs.stat(path)).isDirectory();
    } catch {
        return false;
    }
}

export class ConfigurationLoaderError extends Error {
    constructor(
        message: string,
        public readonly configurationFile?: string,
        public readonly relativeTo?: string | URL | undefined,
        cause?: unknown,
    ) {
        super(message);
        this.name = 'Configuration Loader Error';
        if (cause) {
            this.cause = cause;
        }
    }
}

export class ConfigurationLoaderFailedToResolveError extends ConfigurationLoaderError {
    constructor(
        public readonly configurationFile: string,
        public readonly relativeTo: string | URL,
        cause?: unknown,
    ) {
        const filename = configurationFile.startsWith('file:/') ? fileURLToPath(configurationFile) : configurationFile;
        const relSource = relativeToCwd(relativeTo);

        const message = `Failed to resolve configuration file: "${filename}" referenced from "${relSource}"`;
        super(message, configurationFile, relativeTo, cause);
        // this.name = 'Configuration Loader Error';
    }
}

function relativeToCwd(file: string | URL): string {
    const url = toFileUrl(file);
    const cwdPath = cwdURL().pathname.split('/').slice(0, -1);
    const urlPath = url.pathname.split('/');
    if (urlPath[0] !== cwdPath[0]) return toFilePathOrHref(file);
    let i = 0;
    for (; i < cwdPath.length; ++i) {
        if (cwdPath[i] !== urlPath[i]) break;
    }
    const segments = cwdPath.length - i;
    if (segments > 3) return toFilePathOrHref(file);
    const prefix = [...'.'.repeat(segments)].map(() => '..').join('/');
    return [prefix || '.', ...urlPath.slice(i)].join('/');
}

export const __testing__: {
    getDefaultConfigLoaderInternal: typeof getDefaultConfigLoaderInternal;
    normalizeCacheSettings: typeof normalizeCacheSettings;
    validateRawConfigVersion: typeof validateRawConfigVersion;
    resolveGlobRoot: typeof resolveGlobRoot;
    relativeToCwd: typeof relativeToCwd;
} = {
    getDefaultConfigLoaderInternal,
    normalizeCacheSettings,
    validateRawConfigVersion,
    resolveGlobRoot,
    relativeToCwd,
};
