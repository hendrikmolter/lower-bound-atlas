# Independent review of the Distinct Vectors lower bound

Theorem 1 of the [manuscript](../proofs/distinct-vectors-fixed-coefficient.tex) passes for every fixed real \(0<\gamma<1\), for deterministic algorithms on explicit binary matrices with pairwise distinct rows. The budget counts selected columns and the polynomial factor is in the full bit length. The statement of dv-w1-fixed-coefficient matches this theorem. The reviewed source SHA-256 is a0554681860f13e9d696f891350797f53107ca419dec657d813b21ed826a06fb.

## Reduction

The vertex copies transform Clique into a multipartite instance. A clique in the copy graph uses distinct original vertices since the original graph is simple. Lin's Lemma 14 gives one set for each graph edge and a cover of size at most \(\binom{\ell}{2}\) exactly in the clique case. Its proof uses one color, a map from two bit values to \(\ell-1\) choices, and a vertex-label bit position to index each element. Its universe therefore has at most \(\ell(\ell-1)^2\lceil\log_2 n\rceil\) elements on an \(n\)-vertex copy graph. [Lin, Lemma 14, pp. 81:11–12](https://doi.org/10.4230/LIPIcs.ICALP.2019.81)

I checked the empty-universe and uncovered-element exits before the matrix construction. Every remaining element has a distinct nonzero address and a nonzero incidence vector. The zero-incidence row at address \(2^j\) forces address bit \(j\), since its only difference from the all-zero row is that bit. Such a row exists for every address bit, including when the universe size is a power of two. After those bits are selected, exactly the two rows at each element's address still need separation. Selecting at most the remaining budget of set columns achieves this precisely when those sets cover every element. The matrix explicitly contains two rows per element plus the zero row, and one column per set in addition to the address columns, so producing the full encoding costs polynomial time.

## Running time

The budget is at most a computable function of \(\ell\) plus \(\log_2\log_2 n\). Fix a rational \(\rho\) with \(\gamma<\rho<1\). The exponent in the outer power of two is bounded by \(A(\ell)(\log_2 n)^\rho\). The manuscript splits at \(\log_2 n=A(\ell)^s\) with integer \(s\ge 1/(1-\rho)\). Above the threshold the outer power is at most \(n\). Below it the outer power is at most a computable function of \(\ell\). The integer constants in this time bound can be fixed for each candidate algorithm, including when its stated \(\gamma\) is a noncomputable real. This yields deterministic FPT for Clique.

## Recovery of the historical statement

The theorem covers the historical exclusion of Pilipczuk and Sorge. Fixing \(\gamma=3/4\) suffices for all their coefficients \(c=1/2-\varepsilon\) with \(\varepsilon>0\). For a matrix with positive dimensions, both dimensions are bounded by the bit length of its explicit entries, so an algorithm with polynomial overhead in their sum also has polynomial overhead in the input length. Empty dimensions can be decided directly. This comparison uses the full input class of both results. [Pilipczuk and Sorge, Theorem 1](https://doi.org/10.23638/DMTCS-22-4-7)

## Attribution-only source check

An independent agent compared the source against commit 06aa34c. The sole change is the author line and its ChatGPT acknowledgement. All theorem statements and arguments are byte-identical after line-ending normalization. The original review applies within its recorded scope. Updated source SHA-256: `89bf1663aa5be39d5b4396703a32b80af63dc554609d1b14dc65e4a2ef4e0584`.
