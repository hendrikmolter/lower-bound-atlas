import { createHash } from 'node:crypto';

export function problemDefinition(problem, revision) {
  if (!problem || revision === undefined || problem.revision === revision) return problem;
  return problem.history?.find(entry => entry.revision === revision);
}

export function problemDefinitionHash(problem) {
  return createHash('sha256').update(JSON.stringify([problem.input, problem.question])).digest('hex');
}

// Bound history can be repeated inside newer case snapshots. A copy of an
// older bound inherits the input, symbols and conditions of its own case.
export function boundScopeCase(versions, owner, bound, snapshot) {
  if (snapshot === bound) return owner;
  return versions.find(version => version.revision <= owner.revision && version.bounds.some(
    entry => entry.id === snapshot.id && entry.revision === snapshot.revision)) ?? owner;
}
