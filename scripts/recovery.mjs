import { supersessions } from './supersessions.mjs';

export const recoveryStatuses = {
  recovered: ['Recovered', 'The alternative bound implies the full historical ETH bound.'],
  effective: ['Effectively recovered', 'The historical running-time scale is excluded for algorithms with effective little-o convergence.'],
  logarithmic: ['Recovered up to a logarithmic factor in the exponent', 'The excluded exponent scale loses one logarithmic factor. For a tower, the loss is in its innermost exponent and the height stays the same.'],
  degree: ['Exponent degree recovered', 'If the historical bound excludes 2^(o(k^a)) time, the recovered bound excludes 2^(O(k^(a−ε))) time for every fixed 0 < ε < a. For a tower, this applies to its innermost exponent at the same height.'],
  equivalence: ['Exact recovery ruled out by equivalence', 'The historical bound is equivalent to a refuted ETH formulation. Recovering it exactly would imply that the selected hypothesis is false.'],
  unresolved: ['Unresolved', 'A historical target exists, but the atlas records none of these outcomes under the selected hypothesis.']
};

const exact = (ref, obj) => obj && ref.id === obj.id && ref.revision === obj.revision;
const revision = obj => ({ id: obj.id, revision: obj.revision });
const eligible = b => b?.status === 'established' && b.supported;

export function currentRecoveryBounds(record, hypothesisId) {
  const earlier = supersessions(record.id, hypothesisId, record.bounds, record.supersessions);
  return record.bounds.filter(b => eligible(b) && !earlier.has(b.id) &&
    b.assumptions.length === 1 && b.assumptions[0].id === hypothesisId);
}

export function recoveryComparisons(record, db) {
  const entries = [];
  for (const target of currentRecoveryBounds(record, 'eth')) {
    const barrier = db.formulations?.find(f => f.hypothesisId === 'eth' && f.refutation &&
      f.hypothesisRevision === target.assumptions[0].revision &&
      (target.assessments?.[f.id]?.verdict === 'established-equivalent' ||
        f.equivalences?.some(e => e.caseId === record.id && e.boundId === target.id && e.boundRevision === target.revision)));
    const eth = db.assumptions.find(h => h.id === 'eth');
    const originalBarrier = exact(target.assumptions[0], eth) && eth.refutation &&
      target.assessments?.eth?.verdict === 'established-equivalent';
    for (const hypothesis of db.assumptions.filter(h => h.id !== 'eth')) {
      const pair = {target: revision(target), hypothesis: revision(hypothesis)};
      const start = entries.length;
      for (const a of record.recoveryAssessments ?? []) {
        const b = record.bounds.find(b => exact(a.recovery, b));
        if (!exact(a.target,target) || !exact(a.hypothesis,hypothesis) || !eligible(b)) continue;
        const status = a.scale === 'full' ? (a.effective ? 'effective' : 'recovered') : a.scale;
        entries.push({...a, status});
      }
      if (barrier) entries.push({...pair, status:'equivalence', formulation:revision(barrier)});
      else if (originalBarrier) entries.push({...pair, status:'equivalence', equivalentHypothesis:revision(eth)});
      if (start === entries.length) entries.push({...pair, status:'unresolved'});
    }
  }
  return entries;
}
