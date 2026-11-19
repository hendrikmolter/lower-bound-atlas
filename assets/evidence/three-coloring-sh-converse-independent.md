# Independent agent review of the 3-Coloring converse

**Verdict.** Theorem 1 (`color-sh-converse`) passes for the stated deterministic decision model. I independently checked the [complete manuscript](../proofs/three-coloring-sh-converse.tex) and the quantitative sparsification interface against the cited version of the preprint.

**Reviewed source SHA-256, UTF-8 with LF line endings.** `9f946a0078c62a6ae28959f44f9ad2f6df97133f59a14e8f715a53da497da49a`

The assumption concerns the entire family of fixed powers below one. Negating SH supplies one SAT solver and one fixed exponent $0<b<1$. The proof uses these to produce a single 3-Coloring solver at one fixed exponent $a<1$, which suffices to contradict the premise. No choice of exponent depends on the graph.

The encoding enforces exactly one color per vertex and distinct colors across each edge. It uses $v=3n$ variables and $4n+3|E|$ clauses of width at most three. The construction is polynomial in the full input length even on dense graphs. It needs the sparsified branch length, rather than the length of this initial CNF, in the SAT solver's exponent.

I checked the source's bounds on the number of branches, their width, number of variables, number of clauses, and total generation time. At fixed width three, the constant $K$ is independent of $d$. Consecutive variable names give the claimed binary-length bound, and all polynomial costs for generating the list are allowed by the polynomial factor in the original graph length. The imported mathematical result is the decision implication of [Lemma 2.2 of MIT Hardness Group et al., arXiv:2611.02650v1, printed p. 6](https://arxiv.org/pdf/2611.02650v1#page=6). This review checks its use and treats the lemma as an external input.

Taking $0<d<\min\{1,(1/b-1)/K\}$ makes both exponents $1-d$ and $b(1+Kd)$ strictly smaller than one. A fixed intermediate $a$ absorbs the factor $(\log(v+2))^b$ in the per-branch exponent as well as polynomial overhead. Multiplying by the branch count adds exponents bounded by $O(v^a)$. Substitution of $v=3n$ yields the exact contradiction claimed. The review covers only this converse and gives no literature-priority or human-verification verdict.
