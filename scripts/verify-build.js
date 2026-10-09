'use strict';
// build.js writes to cwd; never assume it implements --out.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const outputs = ['index.html', 'sw.js', 'offline.appcache'];
const tracked = cp.execFileSync('git', ['ls-files', '-z'], {cwd: root}).toString().split('\0').filter(Boolean);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kisetsu-build-'));
function build(label) {
  const dir = path.join(temporary, label);
  fs.mkdirSync(dir);
  for (const file of tracked) {
    if (outputs.includes(file)) continue;
    const dst = path.join(dir, file);
    fs.mkdirSync(path.dirname(dst), {recursive: true});
    fs.copyFileSync(path.join(root, file), dst);
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  cp.execFileSync(process.execPath, ['build.js'], {cwd: dir, stdio: 'inherit'});
  for (const file of outputs) assert(fs.statSync(path.join(dir, file)).size > 0, file);
  cp.execFileSync(process.execPath, ['test.js'], {cwd: dir, stdio: 'inherit'});
  return dir;
}
try {
  const a = build('a');
  const b = build('b');
  for (const file of outputs) {
    const bytes = fs.readFileSync(path.join(a, file));
    assert(bytes.equals(fs.readFileSync(path.join(b, file))), 'Non-deterministic output: ' + file);
    assert(bytes.equals(fs.readFileSync(path.join(root, file))), 'Stale committed output: ' + file);
  }
  console.log('PASS: clean independent builds are byte-identical and match all committed generated outputs');
} finally {
  fs.rmSync(temporary, {recursive: true, force: true});
}
