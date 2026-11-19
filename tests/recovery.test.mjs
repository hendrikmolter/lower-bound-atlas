import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryComparisons } from '../scripts/recovery.mjs';
import { searchCases } from '../scripts/database.mjs';

test('recovery is scoped to a current target revision and one alternative hypothesis', () => {
  const ref = id => ({id, revision:1});
  const bound = (id, h) => ({...ref(id), sources:[], assumptions:[ref(h)], status:'established', supported:true});
  const db = {papers:[], assumptions:['eth','sh','w1'].map(id => ({...ref(id),aliases:[]})), formulations:[{
    ...ref('uniform-eth'), hypothesisId:'eth', hypothesisRevision:1, refutation:'https://example.org/paper',
    equivalences:[{caseId:'sample',boundId:'target',boundRevision:1}]
  }]};
  const c = {id:'sample', bounds:[bound('target','eth'),bound('other','eth'),bound('partial','sh')],
    resolutions:[], aliases:[], recoveryAssessments:[]};
  db.cases = [c];
  const a = {target:ref('target'), hypothesis:ref('sh'), recovery:ref('partial')};
  for (const [scale,effective,status] of [['full',false,'recovered'],['full',true,'effective'],
    ['logarithmic',true,'logarithmic'],['degree',false,'degree']]) {
    c.recoveryAssessments = [{...a,scale,effective}];
    c.recoveryComparisons = recoveryComparisons(c,db);
    const outcomes = c.recoveryComparisons.filter(e => e.target.id === 'target' && e.hypothesis.id === 'sh');
    assert.deepEqual(outcomes.map(e => e.status),[status,'equivalence']);
    assert.equal(searchCases(db,'',{assumption:'w1',recovery:status}).length,0);
    assert.equal(searchCases(db,'',{assumption:'sh',recovery:status}).length,1);
    assert.equal(c.recoveryComparisons.find(e => e.target.id === 'other' && e.hypothesis.id === 'sh').status,'unresolved');
  }
  c.bounds[0].revision++;
  assert.ok(recoveryComparisons(c,db).every(e => e.status === 'unresolved'));
  c.bounds = c.bounds.filter(b => b.assumptions[0].id !== 'eth');
  assert.deepEqual(recoveryComparisons(c,db),[]);
});
