import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(await readFile(path.join(projectDirectory, "build-meta.json"), "utf8"));
const packages = new Map();

async function licenseFromPackage(packageRoot, packageJson) {
  const metadataLicense = packageJson.license ?? packageJson.licenses;
  if (metadataLicense) {
    return typeof metadataLicense === "string" ? metadataLicense : JSON.stringify(metadataLicense);
  }
  for (const fileName of ["LICENSE", "license", "LICENSE.md", "license.md", "COPYING"]) {
    try {
      const text = await readFile(path.join(packageRoot, fileName), "utf8");
      if (/MIT License/i.test(text)) {
        return "MIT (declared in bundled license file)";
      }
      if (/Apache License, Version 2\.0/i.test(text)) {
        return "Apache-2.0 (declared in bundled license file)";
      }
      if (/BSD 3-Clause License/i.test(text)) {
        return "BSD-3-Clause (declared in bundled license file)";
      }
      return `See ${fileName} bundled with the package`;
    } catch {
      // Try the next conventional license filename.
    }
  }
  return null;
}

function packageRootFromInput(input) {
  const normalized = input.replaceAll("\\", "/");
  const marker = "/node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) {
    return null;
  }
  const root = normalized.slice(0, markerIndex + marker.length);
  const segments = normalized.slice(markerIndex + marker.length).split("/");
  const packageSegments = segments[0].startsWith("@") ? segments.slice(0, 2) : segments.slice(0, 1);
  if (packageSegments.length === 0 || packageSegments.some((segment) => !segment)) {
    return null;
  }
  return path.resolve(`${root}${packageSegments.join("/")}`);
}

for (const input of Object.keys(metadata.inputs)) {
  const packageRoot = packageRootFromInput(input);
  if (!packageRoot || packages.has(packageRoot)) {
    continue;
  }
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  const license = await licenseFromPackage(packageRoot, packageJson);
  if (!packageJson.name || !packageJson.version || !license) {
    throw new Error(`Falta nombre, versión o licencia en ${packageRoot}.`);
  }
  packages.set(packageRoot, {
    name: packageJson.name,
    version: packageJson.version,
    license,
    repository: typeof packageJson.repository === "string" ? packageJson.repository : packageJson.repository?.url,
    homepage: packageJson.homepage
  });
}

const sorted = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const rows = sorted.map((pkg) => {
  const link = pkg.homepage || pkg.repository?.replace(/^git\+/, "").replace(/\.git$/, "") || "";
  const project = link ? `[${pkg.name}](${link})` : pkg.name;
  return `| ${project} | ${pkg.version} | ${pkg.license} |`;
});
const notice = [
  "# Third-party notices",
  "",
  "Just Simple Excalidraw bundles the runtime projects listed below. Their respective",
  "licenses apply to their code and assets. This file is generated from the production",
  "bundle metadata; do not edit it manually.",
  "",
  "| Project | Version | License |",
  "| --- | ---: | --- |",
  ...rows,
  "",
  "Excalidraw is an independent open-source project. This plugin is not affiliated with",
  "or endorsed by Excalidraw."
].join("\n");

await writeFile(path.join(projectDirectory, "THIRD_PARTY_NOTICES.md"), `${notice}\n`, "utf8");
console.log(`Avisos de terceros generados para ${sorted.length} paquetes del bundle.`);
