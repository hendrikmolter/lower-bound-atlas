# Source scope for Running-Time Lower Bounds under FPT ≠ W[1]

The 24 November 2026 audit checks the deterministic lower bounds, parameterizations and exponent cutoffs against [Molter, arXiv:2611.26080v2](https://arxiv.org/html/2611.26080v2). Section 2 defines the effectiveness convention and Lemma 1 gives the transfer from Clique.

| Problem | Evidence and applicable scope |
| --- | --- |
| Chromatic Number | Theorem 1, §4, gives the single-exponential exclusion by minimum vertex cover size for a variable color budget. |
| Independent Set | Theorem 2 and §5 give the quadratic exclusion on general graphs by linear rank-width. The construction provides a vertex order. The [width audit](independent-set-rankwidth-sh-source-scope.md) covers the four interfaces and the separate SH sources. |
| Dominating Set | Table 1 and §3, “Dominating Set with a supplied vertex order”, apply the Liu–Meng construction to compact CNF and give an effective quadratic exclusion on monopolar graphs. The order bounds both intrinsic widths. To supply a rank decomposition, put the vertices along a caterpillar in this order. Its internal cuts are prefix cuts and each leaf cut has rank at most one. Construction and encoding take polynomial time in the graph size. |
| Distinct Vectors | Section 3, pp. 11–12, derives the effective bound from the small-universe Set Cover construction and the binary Distinct Vectors reduction. It also gives the recorded fixed-coefficient exclusion for each coefficient strictly between zero and one. |
| Integer Linear Programming Feasibility | Section 3, p. 12, uses the exact-one interpretation of Lin’s incidence construction. The all-ones right-hand side, binary coefficients, nonzero columns and unrestricted column count agree with the Atlas statement by number of equations. |
| Vertex-Disjoint Paths | Theorem 4, §7, uses connected bipartite subcubic graphs with distinct leaf terminals and supplies a path decomposition. |
| Cycle Packing | Theorem 5, §8.2, uses connected bipartite graphs and supplies a path decomposition. |
| Maximum Cycle Cover | Theorem 6, §8.3, uses connected graphs and supplies a path decomposition. The triangle construction preserves the decision question for a spanning collection of cycles. |
| Line Distortion | Theorem 7 and Lemma 12, §9, give the distortion-times-logarithm exclusion on connected simple unweighted bipartite graphs, for the real and integer lines. |

For the intrinsic treewidth entries, §1.4 after Table 2 uses the inequality between treewidth and the width of the supplied path decomposition. Taking a prefix maximum of a running-time exponent preserves an effective sublinear rate at the displayed scale and justifies the substitution even for nonmonotone exponents.
