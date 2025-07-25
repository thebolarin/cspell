import type { TextEncoding, VFileSystem, VFileSystemProvider, VirtualFS } from 'cspell-io';
import { getDefaultVirtualFs } from 'cspell-io';

export type { VFileSystemProvider, VfsDirEntry, VirtualFS } from 'cspell-io';
export { FSCapabilityFlags, VFileSystem } from 'cspell-io';

export function getVirtualFS(): VirtualFS {
    return getDefaultVirtualFs();
}

export function getFileSystem(): Required<VFileSystem> {
    return getVirtualFS().fs;
}

export function registerCSpell(fsp: VFileSystemProvider): void {
    const vfs = getVirtualFS();
    vfs.registerFileSystemProvider(fsp);
}

export async function readTextFile(url: URL, encoding: TextEncoding = 'utf8'): Promise<string> {
    const file = await getFileSystem().readFile(url, encoding);
    return file.getText();
}
