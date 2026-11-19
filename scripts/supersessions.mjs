// A comparison concerns two exact statements under the same hypothesis.
// Record direct witnesses. Omit an edge if the comparison is unknown.
export function supersessions(problem, hypothesis, bounds, relations = []) {
  const versions = new Map(bounds.map(b => [b.id, b]));
  const edges = new Map();
  for (const edge of relations) {
    if (edge.problem !== problem || edge.hypothesis !== hypothesis) continue;
    const weaker = versions.get(edge.weaker), stronger = versions.get(edge.stronger);
    const eligible = (bound, revision) => bound?.revision === revision && bound.status === 'established' && bound.supported &&
      bound.assumptions.length === 1 && bound.assumptions[0].id === hypothesis;
    if (!eligible(weaker, edge.weakerRevision) || !eligible(stronger, edge.strongerRevision) ||
        weaker.assumptions[0].revision !== stronger.assumptions[0].revision) continue;
    if (!edges.has(weaker.id)) edges.set(weaker.id, []);
    edges.get(weaker.id).push(edge);
  }
  // A bound is hidden only if a current bound directly supersedes it.
  // A longer chain requires a recorded comparison to a current bound.
  const witnessed = new Map();
  for (const [id, candidates] of edges) {
    const direct = candidates.find(edge => !edges.has(edge.stronger));
    if (direct) witnessed.set(id, direct);
  }
  return witnessed;
}
