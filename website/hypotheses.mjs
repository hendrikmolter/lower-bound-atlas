const descriptions = {
  eth: {
    title: 'Exponential Time Hypothesis (ETH)',
    summary: 'Original, uniform, and strongly uniform ETH for 3-SAT, measured in the number of variables.',
    statement: 'There exists δ > 0 such that, for every fixed C ≥ 0, no deterministic algorithm decides 3-SAT in time O(2^(δ n) L^C), where n is the number of variables and L is the input length in bits.',
  },
  sh: {
    title: 'Satisfiability Hypothesis (SH)',
    summary: 'A family of lower bounds for CNF-SAT in the input length.',
    statement: 'For every fixed 0 < a < 1, no deterministic algorithm decides CNF-SAT in time 2^O(n^a) · poly(n), where n is the normalized encoding length of the formula.',
  },
  w1: {
    title: 'FPT ≠ W[1]',
    summary: 'Some problem in W[1] is not fixed-parameter tractable.',
    statement: 'There exists a parameterized decision problem in W[1] for which no deterministic algorithm runs in time f(k) L^C for any computable function f and constant C, where k is the parameter and L is the input length in bits.',
  },
  np_qp: {
    title: 'NP ⊈ QP',
    summary: 'Some problem in NP requires more than quasipolynomial time.',
    statement: 'There exists a decision problem in NP for which no deterministic algorithm runs in time 2^(O((log(L+2))^c)) for any fixed c ≥ 1, where L is the input length in bits.',
  },
};

export function hypothesisText(version) {
  return version.revision === 1 ? descriptions[version.id] : undefined;
}
