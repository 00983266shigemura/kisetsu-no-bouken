import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const path=new URL('./fixtures.v1.json',import.meta.url);
const bytes=readFileSync(path), suite=JSON.parse(bytes);
assert.equal(suite.schema,'blind-eval-fixtures/v1');
assert(suite.cases.length>=25,'PG-023 minimum acceptance fixture count is 25');
const ids=new Set();
for(const c of suite.cases){
  assert.match(c.case_id,/^B-[A-F0-9]{4}$/);
  assert(!ids.has(c.case_id),'duplicate case id'); ids.add(c.case_id);
  assert.equal(Object.keys(c).sort().join(','),'case_id,prompt');
  assert.equal(Object.keys(c).length,2,'fixture must contain only case id and prompt');
  assert(c.prompt.length>30);
}
const rubric=readFileSync(new URL('./rubric.v1.md',import.meta.url),'utf8');
for(const required of ['Critical failure rules','Evidence fidelity','Counterevidence','Authority and reversibility','Case key custody','NOT_RUN_NO_INDEPENDENT_EVALUATOR']) assert(rubric.includes(required));
console.log(`PASS blind fixture isolation: ${suite.cases.length} cases; sha256=${createHash('sha256').update(bytes).digest('hex')}; answer-key absent`);
