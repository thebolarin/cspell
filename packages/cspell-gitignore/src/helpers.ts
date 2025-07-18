import * as path from 'node:path';

import { findRepoRoot } from './findRepoRoot.js';

interface ParsedPath {
    /**
     * The root of the path such as '/' or 'c:\'
     */
    root: string;
    /**
     * The full directory path such as '/home/user/dir' or 'c:\path\dir'
     */
    dir: string;
    /**
     * The file name including extension (if any) such as 'index.html'
     */
    base: string;
    /**
     * The file extension (if any) such as '.html'
     */
    ext: string;
    /**
     * The file name without extension (if any) such as 'index'
     */
    name: string;
}

/**
 * @deprecated to be removed in the next major version.
 */
export interface PathInterface {
    dirname(path: string): string;
    isAbsolute(p: string): boolean;
    join(...paths: string[]): string;
    normalize(p: string): string;
    parse(path: string): ParsedPath;
    relative(from: string, to: string): string;
    resolve(...paths: string[]): string;
    sep: string;
}

interface PathHelper {
    /**
     * Parse a directory and return its root
     * @param directory - directory to parse.
     * @returns root directory
     */
    directoryRoot(directory: string): string;

    /**
     * Find the git repository root directory.
     * @param directory - directory to search up from.
     * @returns resolves to `.git` root or undefined
     */
    findRepoRoot(directory: string): Promise<string | undefined>;

    /**
     * Checks to see if the child directory is nested under the parent directory.
     * @param parent - parent directory
     * @param child - possible child directory
     * @returns true iff child is a child of parent.
     */
    isParentOf(parent: string, child: string): boolean;

    /**
     * Check to see if a parent directory contains a child directory.
     * @param parent - parent directory
     * @param child - child directory
     * @returns true iff child is the same as the parent or nested in the parent.
     */
    contains(parent: string, child: string): boolean;

    /**
     * Make a path relative to another if the other is a parent.
     * @param path - the path to make relative
     * @param rootPath - a root of path
     * @returns the normalized relative path or undefined if rootPath is not a parent.
     */
    makeRelativeTo(path: string, rootPath: string): string | undefined;

    /**
     * Normalize a path to have only forward slashes.
     * @param path - path to normalize
     * @returns a normalized string.
     */
    normalizePath(path: string): string;
}

export function factoryPathHelper(path: PathInterface): PathHelper {
    function directoryRoot(directory: string): string {
        const p = path.parse(directory);
        return p.root;
    }

    function isParentOf(parent: string, child: string): boolean {
        const rel = path.relative(parent, child);
        return !!rel && !path.isAbsolute(rel) && rel[0] !== '.';
    }

    function contains(parent: string, child: string): boolean {
        const rel = path.relative(parent, child);
        return !rel || (!path.isAbsolute(rel) && rel[0] !== '.');
    }

    function makeRelativeTo(child: string, parent: string): string | undefined {
        const rel = path.relative(parent, child);
        if (path.isAbsolute(rel) || rel[0] === '.') return undefined;
        return normalizePath(rel);
    }

    function normalizePath(path: string): string {
        return path.replaceAll('\\', '/');
    }

    return {
        directoryRoot,
        findRepoRoot,
        isParentOf,
        contains,
        normalizePath,
        makeRelativeTo,
    };
}

const defaultHelper = factoryPathHelper(path);

/**
 * Parse a directory and return its root
 * @param directory - directory to parse.
 * @returns root directory
 * @deprecated to be removed in the next major version.
 */
export const directoryRoot: (directory: string) => string = defaultHelper.directoryRoot;

/**
 * Checks to see if the child directory is nested under the parent directory.
 * @param parent - parent directory
 * @param child - possible child directory
 * @returns true iff child is a child of parent.
 * @deprecated to be removed in the next major version.
 */
export const isParentOf: (parent: string, child: string) => boolean = defaultHelper.isParentOf;

/**
 * Check to see if a parent directory contains a child directory.
 * @param parent - parent directory
 * @param child - child directory
 * @returns true iff child is the same as the parent or nested in the parent.
 * @deprecated to be removed in the next major version.
 */
export const contains: (parent: string, child: string) => boolean = defaultHelper.contains;

/**
 * Make a path relative to another if the other is a parent.
 * @param path - the path to make relative
 * @param rootPath - a root of path
 * @returns the normalized relative path or undefined if rootPath is not a parent.
 * @deprecated to be removed in the next major version.
 */
export const makeRelativeTo: (path: string, rootPath: string) => string | undefined = defaultHelper.makeRelativeTo;

/**
 * Normalize a path to have only forward slashes.
 * @param path - path to normalize
 * @returns a normalized string.
 * @deprecated to be removed in the next major version.
 */
export const normalizePath: (path: string) => string = defaultHelper.normalizePath;

export const DefaultPathHelper: PathHelper = {
    directoryRoot,
    findRepoRoot,
    isParentOf,
    contains,
    makeRelativeTo,
    normalizePath,
};
