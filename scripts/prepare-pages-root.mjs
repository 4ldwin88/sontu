import { readFile, writeFile } from "node:fs/promises";

const source = new URL("../dist/index.html", import.meta.url);
const target = new URL("../index.html", import.meta.url);

const html = await readFile(source, "utf8");
const withBase = html.replace("<head>", '<head><base href="./dist/">');

if (withBase === html) {
  throw new Error("Could not add GitHub Pages base tag to dist/index.html.");
}

await writeFile(target, withBase, "utf8");
