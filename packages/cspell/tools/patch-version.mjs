import { promises as fs } from 'node:fs';

const urlPackageJson = new URL('../package.json', import.meta.url);
const urlVersionFile = new URL('../src/pkgInfo.ts', import.meta.url);

async function readPackageJson() {
    const pkgJson = await fs.readFile(urlPackageJson, 'utf8');
    return JSON.parse(pkgJson);
}

async function writeVersionFile(pkgJson) {
    const fileContent = /*ts*/ `\
// This file is generated by tools/patch-version.mjs

export { pkgDir } from './dirname.js';

export interface PackageJson {
    name: string;
    version: string;
    engines: { node: string };
}

export const name: string = '${pkgJson.name}';
export const version: string = '${pkgJson.version}';
export const engines: PackageJson['engines'] = { node: '${pkgJson.engines.node}' };

export const npmPackage: PackageJson = { name, version, engines };
`;
    await fs.writeFile(urlVersionFile, fileContent);
}

async function run() {
    const pkgJson = await readPackageJson();
    await writeVersionFile(pkgJson);
}

await run();
