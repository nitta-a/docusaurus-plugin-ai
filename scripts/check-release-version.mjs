import { readFile } from 'node:fs/promises';

const packagePaths = ['../package.json', '../packages/ui/package.json'];
const packages = await Promise.all(
  packagePaths.map(async (packagePath) => JSON.parse(await readFile(new URL(packagePath, import.meta.url), 'utf8'))),
);
const packageJson = packages[0];
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (!tag || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(tag)) {
  throw new Error(`Expected a SemVer release tag such as v${packageJson.version}; received ${tag ?? '(missing)'}.`);
}

const tagVersion = tag.slice(1);
if (tagVersion !== packageJson.version) {
  throw new Error(`Release tag ${tag} does not match package.json version ${packageJson.version}.`);
}

for (const packageToCheck of packages.slice(1)) {
  if (packageToCheck.version !== tagVersion) {
    throw new Error(`Release tag ${tag} does not match ${packageToCheck.name}@${packageToCheck.version}.`);
  }
}

console.log(`Release tag ${tag} matches ${packages.map(({ name, version }) => `${name}@${version}`).join(', ')}.`);
