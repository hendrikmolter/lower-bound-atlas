# Original-source checks for the effective lower bounds

## Integer Linear Programming Feasibility by number of equality constraints (w1)

Checked the all-ones right-hand side and effective exponent using the exact-one interpretation of the incidence matrix in Lin’s Lemma 14.

- [A Simple Gap-Producing Reduction for the Parameterized Set Cover Problem](https://doi.org/10.4230/LIPIcs.ICALP.2019.81), Lemma 14 and proof, §3.4, pp. 81:11–81:12.

## Dominating Set by linear rank-width (w1)

Checked the effective quadratic exclusion on monopolar graphs using Liu and Meng’s construction for arbitrary CNF, its supplied order and the width guarantee for this parameterization.

- [Lower Bounds for Domination-Type Problems Parameterized by Rank-Width](https://arxiv.org/abs/2608.18854v1), Section 3.2, Lemmas 3.5–3.6, and Appendix C, proof of Theorem C.1.

## Dominating Set by rank-width (w1)

Checked the effective quadratic exclusion on monopolar graphs using Liu and Meng’s construction for arbitrary CNF, its supplied order and the width guarantee for this parameterization.

- [Lower Bounds for Domination-Type Problems Parameterized by Rank-Width](https://arxiv.org/abs/2608.18854v1), Section 3.2, Lemmas 3.5–3.6, and Appendix C, proof of Theorem C.1.

## Dominating Set by width of a supplied vertex order (w1)

Checked the effective quadratic exclusion on monopolar graphs using Liu and Meng’s construction for arbitrary CNF, its supplied order and the width guarantee for this parameterization.

- [Lower Bounds for Domination-Type Problems Parameterized by Rank-Width](https://arxiv.org/abs/2608.18854v1), Section 3.2, Lemmas 3.5–3.6, and Appendix C, proof of Theorem C.1.

## Dominating Set by width of a supplied rank decomposition (w1)

Checked the effective quadratic exclusion on monopolar graphs using Liu and Meng’s construction for arbitrary CNF, its supplied order and the width guarantee for this parameterization.

- [Lower Bounds for Domination-Type Problems Parameterized by Rank-Width](https://arxiv.org/abs/2608.18854v1), Section 3.2, Lemmas 3.5–3.6, and Appendix C, proof of Theorem C.1.

## Vertex Cover by treewidth (eth)

Forward implication for intrinsic treewidth. The Vertex Cover instances produced from sparse 3-SAT have linear graph order, and treewidth is bounded by that order. A solver with the stated dependence on treewidth would solve sparse 3-SAT in subexponential time.

- [Which Problems Have Strongly Exponential Complexity?](https://doi.org/10.1006/jcss.2001.1774), Corollary 2, p. 524, and Theorem 5, p. 526.
- [Lower bounds based on the Exponential Time Hypothesis](https://bulletin.eatcs.org/index.php/beatcs/article/view/92), Theorem 3.3, p. 52.

## Vertex Cover by treewidth (w1)

Forward implication for intrinsic treewidth. Logarithmic-treewidth Vertex Cover is XALP-hard, so it is W[1]-hard. Discard the supplied decomposition from the reduction output. For a Clique input of order n and parameter k, the output treewidth is at most g(k)(1+log₂ n) for a computable g. Use the computable cutoff for a slope at most 1/g(k). Above the cutoff the exponential factor is polynomial in n, and below it the computable exponent has a finite maximum controlled by k. The polynomial-size reduction output then gives an FPT algorithm for Clique.

- [On the Complexity of Problems on Tree-Structured Graphs](https://doi.org/10.4230/LIPIcs.IPEC.2022.6), §5.3, Theorem 11 and Corollary 12, pp. 6:13–6:14.

## Red-Blue Dominating Set by treewidth (eth)

Forward implication for intrinsic treewidth. Subdivide every edge of a Vertex Cover instance. The blue original vertices dominate the red subdivision vertices exactly when they cover all original edges. A single bag with all original vertices and an attached bag for each subdivision gives treewidth at most max(n−1, 2) for original order n. The new explicit encoding has polynomial size.

- [Which Problems Have Strongly Exponential Complexity?](https://doi.org/10.1006/jcss.2001.1774), Corollary 2, p. 524, and Theorem 5, p. 526.
- [Lower bounds based on the Exponential Time Hypothesis](https://bulletin.eatcs.org/index.php/beatcs/article/view/92), Theorem 3.3, p. 52.
- [On the Complexity of Problems on Tree-Structured Graphs](https://doi.org/10.4230/LIPIcs.IPEC.2022.6), §5.3, Theorem 11 and Corollary 12, pp. 6:13–6:14.

## Red-Blue Dominating Set by treewidth (w1)

Forward implication for intrinsic treewidth. Logarithmic-treewidth Red-Blue Dominating Set is XALP-hard, so it is W[1]-hard. The edge-subdivision construction has an explicit blue/red partition. Discard the supplied decomposition. For a Clique input of order n and parameter k, the output treewidth is at most g(k)(1+log₂ n) for a computable g. Use the computable cutoff for a slope at most 1/g(k). Above the cutoff the exponential factor is polynomial in n, and below it the computable exponent has a finite maximum controlled by k. The polynomial-size reduction output then gives an FPT algorithm for Clique.

- [On the Complexity of Problems on Tree-Structured Graphs](https://doi.org/10.4230/LIPIcs.IPEC.2022.6), §5.3, Theorem 11 and Corollary 12, pp. 6:13–6:14.

## Feedback Vertex Set by treewidth (eth)

Forward implication for intrinsic treewidth. Add one private vertex adjacent to both ends of each edge of the Vertex Cover instance. A cover leaves a forest. Conversely, any feedback vertex set hits each edge triangle, so replacing any selected private vertex with an endpoint yields a cover of no larger size. A bag for each private vertex and its endpoints gives treewidth at most max(n−1, 2) for original order n, with polynomial encoding size.

- [Which Problems Have Strongly Exponential Complexity?](https://doi.org/10.1006/jcss.2001.1774), Corollary 2, p. 524, and Theorem 5, p. 526.
- [Lower bounds based on the Exponential Time Hypothesis](https://bulletin.eatcs.org/index.php/beatcs/article/view/92), Theorem 3.3, p. 52.
- [A Framework for Exponential-Time-Hypothesis–Tight Algorithms and Lower Bounds in Geometric Intersection Graphs](https://doi.org/10.1137/20M1320870), §4.4, Feedback Vertex Set paragraph, p. 1324.

## Feedback Vertex Set by treewidth (w1)

Forward implication for intrinsic treewidth. Logarithmic-pathwidth Feedback Vertex Set is XNLP-hard, so it is W[1]-hard. A graph’s treewidth is at most the width of the supplied path decomposition, which can be discarded. For a Clique input of order n and parameter k, the output treewidth is at most g(k)(1+log₂ n) for a computable g. Use the computable cutoff for a slope at most 1/g(k). Above the cutoff the exponential factor is polynomial in n, and below it the computable exponent has a finite maximum controlled by k. The polynomial-size reduction output then gives an FPT algorithm for Clique.

- [XNLP-Completeness for Parameterized Problems on Graphs with a Linear Structure](https://doi.org/10.1007/s00453-024-01274-9), Theorem 6 and §4.3, Lemma 5 and Claim 15.
