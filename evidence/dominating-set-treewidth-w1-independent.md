# Independent agent review of the effective treewidth lower bound for Dominating Set

**Verdict.** Theorem 1 (ds-treewidth) in [proof revision 1](../proofs/dominating-set-treewidth-w1.tex) passes for the proposed ds-tw-w1 bound, revision 1. Under deterministic FPT ≠ W[1], it excludes $O(f(k)2^{h(t)}B^C)$ for every fixed $C$, total computable positive integer-valued $f$, and computable nonnegative integer-valued $h$ that is effectively sublinear. Here the solver receives a connected simple bipartite graph and its binary solution budget $k$, $t$ is intrinsic treewidth, and $B$ is complete binary input length.

**Reviewed source SHA-256, UTF-8 with LF line endings.** `30c349aac9eab92dcb99e9bd50a0b67d8fa7ba97bef46213c81890232d73ddfe`

The partite copy construction preserves the requested Clique size. I verified Lin's exact Lemma 14 in the ICALP proceedings, including its polynomial clock, indexed sets for graph edges, budget $q=\binom{\ell}{2}$ and universe size at most $\ell^3\lceil\log_2 n\rceil$ from the explicit universe. This import uses the exact Set Cover gap at $q$ from the lemma, independently of the paper's approximation theorem.

The incidence graph plus universal set-neighbor root and its $q+2$ leaves is connected and bipartite after the empty and uncovered universe cases are handled. Any dominating set of size at most $q+1$ must select the root. Replacing each selected element by an incident set preserves cover of that element, and every unselected element already requires a selected neighboring set. Conversely a cover and the root dominate all vertices. Root plus universe vertices form a vertex cover, yielding an explicit path decomposition of width at most $u+1$. It is used only to bound the intrinsic width.

I checked the deterministic runtime transfer with a fixed input-polynomial degree. The output budget $q+1$ depends on the Clique parameter alone, permitting the arbitrary computable prefactor. The stated modulus gives an $O(\log n)$ exponent on its tail and computability of $h$ bounds the finite exceptional prefix as a parameter function. The composed algorithm would place Clique in FPT. This verdict concerns the exact effective convention and leaves every converse unassessed. [Clique hardness source](https://doi.org/10.1016/0304-3975(94)00097-3) · [Lin, Lemma 14](https://doi.org/10.4230/LIPIcs.ICALP.2019.81)

Reviewed independently by the Codex agent secondary_natural, 18 November 2026.
