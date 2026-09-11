import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (!tag || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(tag)) {
  throw new Error(`Expected a SemVer release tag such as v${packageJson.version}; received ${tag ?? '(missing)'}.`);
}

const tagVersion = tag.slice(1);
if (tagVersion !== packageJson.version) {
  throw new Error(`Release tag ${tag} does not match package.json version ${packageJson.version}.`);
}

console.log(`Release tag ${tag} matches ${packageJson.name}@${packageJson.version}.`);
