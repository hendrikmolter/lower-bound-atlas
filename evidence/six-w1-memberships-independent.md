# Independent reviews of six membership proofs and the boundary transfer

On 18 November 2026, Codex agent /root verified the seven theorems in source revision 1. Its LF-normalized SHA-256 is f746b961e52ff19036f9e05aee729f20e4bf71d49d9c0eff9e19b4806aa94802.

The review checked the clique of size k² for explicit equality Grid Tiling, the polynomial bit complexity of rational interval and disk comparisons, and the distance tests including vertices in different components. For fixed-width CNF it checked that bounded-depth clause circuits leave just one large gate per input-output path and introduce no new weight-bearing inputs.

For the boundary transfer the reviewer verified that λ=(3−r)/2 is strictly greater than one and that λ²r−1=(r−1)²(r−4)/4 is strictly negative. The transformed square ratios grow by at most the disk ratio multiplier. Thus equality pairs become strictly separated while intersections survive. Finding the maximum over pairs and rescaling binary rational coordinates takes polynomial bit time.

## Published hardness directions

On the same date, Codex agent /root/population_c checked the cited source statements and their input interfaces:

- The reduction from Clique in Theorem 14.28 lists the cell tables and preserves their side-length parameter. Its coordinate convention is interchangeable by swapping the two coordinates.
- Marx’s construction uses open unit-diameter disks with rational centers. Uniform rescaling of both centers and sizes converts diameter one to radius one. Theorem 7 changes the boundary convention while preserving the budget.
- Marx lists open unit squares with rational corners. Theorem 7 preserves disjointness and the budget when passing to closed unit squares.
- Setting d to two in the unweighted graph gives exactly Independent Set by the same requested solution size. Disconnected vertices have infinite distance and are allowed together.
- Theorem 14.32 gives a parameterized reduction from the hard inequality version of Grid Tiling to unweighted planar Scattered Set. The distance threshold is part of the target input and the desired selection size depends only on grid side.
- The ordinary parameterized hardness in Theorem 5.5 concerns bounded-width CNF at exact weight k. Width q is fixed and the runtime permits dependence on that fixed width.

The geometric historical ETH and square-Clique statements use the previously recorded textbook or square-Clique source. Theorem 7 applies without changing k or n. Its polynomial increase in the complete input length is absorbed by the fixed polynomial bit factor. No new quantitative comparison is inferred from the membership proofs.
