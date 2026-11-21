const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");

esbuild.buildSync({
  entryPoints: [path.join(__dirname, "validator.js")],
  outfile: path.join(root, "files/shift-config-validator.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "ToyFactoryShiftConfig",
  footer: { js: "globalThis.ToyFactoryShiftConfig = ToyFactoryShiftConfig;" },
  target: "es2020",
  minify: true,
  legalComments: "eof"
});
// Preserve third-party notices when redistributing the bundled library.
const packages = ["ajv", "fast-deep-equal", "fast-uri", "json-schema-traverse", "require-from-string"];
const notices = packages.map(name => {
  const directory = path.dirname(require.resolve(`${name}/package.json`));
  const license = fs.readdirSync(directory).find(file => /^licen[cs]e(?:\.txt|\.md)?$/i.test(file));
  if (!license) throw new Error(`Missing license for ${name}`);
  return `${name}\n${fs.readFileSync(path.join(directory, license), "utf8")}`;
});
fs.writeFileSync(path.join(root, "files/ajv-LICENSE.txt"), notices.join("\n\n-----\n\n"));
