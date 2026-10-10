'use strict';
// build.js writes to cwd; never assume it implements --out.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const outputs = ['index.html', 'sw.js', 'offline.appcache', 'release.json'];
// Deliberately independent of build.js: new runtime inputs require reviewed coverage here too.
const canonicalPaths = ['build.js', 'icon.svg', 'manifest.webmanifest', 'package-lock.json', 'package.json', 'source.html'];
const deployedPaths = ['icon.svg', 'index.html', 'manifest.webmanifest', 'offline.appcache', 'sw.js'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const tracked = cp.execFileSync('git', ['ls-files', '-z'], {cwd: root}).toString().split('\0').filter(Boolean);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kisetsu-build-'));
function copy(label) {
  const dir = path.join(temporary, label);
  fs.mkdirSync(dir);
  for (const file of tracked) {
    if (outputs.includes(file)) continue;
    const dst = path.join(dir, file);
    fs.mkdirSync(path.dirname(dst), {recursive: true});
    fs.copyFileSync(path.join(root, file), dst);
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  return dir;
}
function records(dir, paths) {
  return paths.map(name => {
    const bytes = fs.readFileSync(path.join(dir, name));
    return {path: name, sha256: hash(bytes), bytes: bytes.length};
  });
}
function verifyIdentity(dir) {
  const release = JSON.parse(fs.readFileSync(path.join(dir, 'release.json')));
  const sources = records(dir, canonicalPaths);
  const expectedId = hash(JSON.stringify(sources.map(r => [r.path, r.sha256])) + '\n');
  assert.equal(release.schemaVersion, 1);
  assert.equal(release.algorithm, 'SHA256');
  assert.equal(release.identityEncoding, 'UTF8 JSON array of sorted [path,sha256] pairs followed by LF');
  assert.equal(release.releaseId, expectedId, 'Independent canonical release ID mismatch');
  assert.deepStrictEqual(release.canonicalSources, sources);
  assert.deepStrictEqual(release.deployedFiles, records(dir, deployedPaths));
  assert.equal(release.selfHashExcluded, true);
  assert(!release.canonicalSources.some(r => outputs.includes(r.path)));
  assert(!release.deployedFiles.some(r => r.path === 'release.json'));
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json')));
  const version = pkg.devDependencies.typescript;
  assert(/^\d+\.\d+\.\d+$/.test(version), 'Compiler dependency must be exact');
  assert.equal(lock.packages[''].devDependencies.typescript, version);
  assert.equal(lock.packages['node_modules/typescript'].version, version);
  assert.equal(require(path.join(dir, 'node_modules/typescript')).version, version);
  assert(lock.packages['node_modules/typescript'].integrity);
  assert.deepStrictEqual(release.compiler, {name: 'typescript', version, lockIntegrity: lock.packages['node_modules/typescript'].integrity});
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const appcache = fs.readFileSync(path.join(dir, 'offline.appcache'), 'utf8');
  assert(html.includes('<meta name="kisetsu-release-id" content="' + expectedId + '">'));
  assert(sw.includes("const CACHE=PREFIX+'" + expectedId.slice(0, 16) + "'"));
  assert(sw.includes("'./release.json'"));
  assert(appcache.includes('# release ' + expectedId + '\n'));
  assert(appcache.split('\n').includes('./release.json'));
  return release;
}
function verifyRuntimeImages(dir) {
  const html = fs.readFileSync(path.join(dir, 'source.html'), 'utf8');
  const match = html.match(/window\.__ASSET_DATA__=(.*?);window\.__CONTENT__=(.*?);<\/script>/);
  assert(match, 'Missing canonical inline asset/content maps');
  const assets = JSON.parse(match[1]);
  const content = JSON.parse(match[2]);
  assert.equal(Object.keys(assets).length, 110, 'Final release requires all110 inline images');
  const refs = content.themes.map(t => t.image).concat(content.questions.flatMap(q => q.options.filter(o => o.image).map(o => o.image)));
  refs.push('assets/icon.svg'); // runtime img() fallback
  for (const ref of refs) assert(Object.prototype.hasOwnProperty.call(assets, ref), 'Uncovered external runtime image: ' + ref);
  for (const [name, uri] of Object.entries(assets)) assert(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(uri), 'Final embedded image must be JPEG: ' + name);
  const inlineValues = new Set(Object.values(assets));
  // Check literal HTML image/icon and CSS paths outside the data script. Dynamic helpers are covered by dictionaries above.
  const markup = html.replace(match[0], '');
  const literalRefs = Array.from(markup.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/g), x => x[1]);
  for (const tag of markup.matchAll(/<link\b[^>]*>/g)) {
    if (/\brel=["'](?:icon|apple-touch-icon)["']/.test(tag[0])) {
      const href = tag[0].match(/\bhref=["']([^"']+)["']/); if (href) literalRefs.push(href[1]);
    }
  }
  for (const url of markup.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)) literalRefs.push(url[1]);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.webmanifest')));
  literalRefs.push(...manifest.icons.map(i => i.src));
  for (const ref of literalRefs) {
    if (ref.includes('${')) continue;
    if (ref.startsWith('data:')) assert(inlineValues.has(ref), 'Literal image bytes differ from approved inline map');
    else assert(canonicalPaths.includes(ref.replace(/^\.\//, '')), 'New external image lacks canonical hash/cache coverage: ' + ref);
  }
}
function compile(dir) {
  cp.execFileSync(process.execPath, ['build.js'], {cwd: dir, stdio: 'inherit'});
  for (const file of outputs) assert(fs.statSync(path.join(dir, file)).size > 0, file);
  return verifyIdentity(dir);
}
try {
  const a = copy('a'); const original = compile(a);
  const b = copy('b'); compile(b);
  for (const file of outputs) assert(fs.readFileSync(path.join(a, file)).equals(fs.readFileSync(path.join(b, file))), 'Non-deterministic output: ' + file);
  // Generated garbage cannot feed the canonical identity and must be overwritten exactly.
  for (const file of outputs) fs.writeFileSync(path.join(b, file), 'untrusted generated bytes\n');
  assert.equal(compile(b).releaseId, original.releaseId);
  for (const file of outputs) assert(fs.readFileSync(path.join(a, file)).equals(fs.readFileSync(path.join(b, file))), 'Generated output affected canonical build: ' + file);
  const changed = copy('changed');
  fs.appendFileSync(path.join(changed, 'source.html'), '\n<!-- canonical byte mutation control -->\n');
  assert.notEqual(compile(changed).releaseId, original.releaseId, 'Canonical source mutation did not alter release identity');
  console.log('PASS: independent release hashes, actual locked compiler, generated-input exclusion and source-mutation controls');
  verifyRuntimeImages(a); verifyRuntimeImages(b);
  cp.execFileSync(process.execPath, ['test.js'], {cwd: a, stdio: 'inherit'});
  cp.execFileSync(process.execPath, ['test.js'], {cwd: b, stdio: 'inherit'});
  for (const file of outputs) assert(fs.readFileSync(path.join(a, file)).equals(fs.readFileSync(path.join(root, file))), 'Stale committed output: ' + file);
  console.log('PASS: final110 image coverage; clean independent builds match every committed generated output');
} finally {
  fs.rmSync(temporary, {recursive: true, force: true});
}
