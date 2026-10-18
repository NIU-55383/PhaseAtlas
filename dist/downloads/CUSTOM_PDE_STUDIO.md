# PhaseAtlas Custom PDE Studio

The studio turns a typed evolution equation into an inspectable, reproducible numerical experiment. Open `/studio.html`, or select **Custom PDE studio** in the main navigation. The original front laboratory remains available with its model-specific analytic checks.

## A first experiment

1. Select **Heat diffusion** and run. Its supplied periodic solution gives a direct reference comparison.
2. Edit the right-hand side to `nu*lap(u) - 0.5*Dx(u^2,1)`, set `nu = 0.025`, and clear the reference formula. The heat reference is no longer a solution of this changed equation.
3. Set the initial data to `0.7*sin(x)`, length `6.283185307179586`, grid `256`, end time `2`, and step `0.01`.
4. Play the evolution and inspect the space–time diagram. All frames use the same color and vertical scales.
5. Select **Check resolution**. The time comparison halves the actual step; the spatial comparison doubles the grid while holding that smaller step fixed.
6. Export JSON to preserve all fields, frames, parameters, diagnostics, method, and any refinement results. CSV contains every spatial point at every saved time. SVG contains the current field and machine-readable provenance. WebM records the complete trajectory.

Changing an input does not relabel old results: the last successful experiment remains visible and is what exports contain. Failed or canceled runs retain that previous experiment. JSON imports recompute configurations and discard imported numerical conclusions. Share links contain only the configuration; recipients review it before running.

## Supported equations

The model is a system of one to three real-valued fields:

`∂t u_j = L_j u_j + R_j(u, v, w, x, y, t)`.

The domain is a periodic interval in one dimension or a periodic rectangle in two dimensions. The coordinate ranges are `[-Lx/2, Lx/2)` and, in 2D, `[-Ly/2, Ly/2)`. Spatial derivatives up to total order four are accepted. All quantities are in user-chosen consistent units; examples are dimensionless.

| Input | Meaning |
| --- | --- |
| `u`, `v`, `w` | Active dependent fields, in that fixed order |
| `x`, `y`, `t` | Position and time; y is available only in 2D |
| `Lx`, `Ly`, `pi`, `e` | Domain lengths and mathematical constants |
| `Dx(u,1)` or `D(u,1)` | First x derivative |
| `Dx(u,4)` | Fourth x derivative |
| `Dy(v,2)` | Second y derivative |
| `lap(u)` | Laplacian: u_xx in 1D, u_xx + u_yy in 2D |
| `biharm(u)` | Squared Laplacian, including the 2u_xxyy term in 2D |
| `lap(u^3)` | A derivative acting on a nonlinear expression |
| `sin cos tanh exp log sqrt abs min max` | Allowed mathematical functions |
| `+ - * / ^` | Arithmetic; multiplication must be explicit |

Use parameters such as `nu=0.1; c=2*nu`. Parameters can reference earlier parameters. Coordinates, field names, function names and built-in constants are reserved. Initial formulas depend only on coordinates and parameters. Optional reference formulas may also depend on t. When all fields have references, the studio checks their initial match and samples the PDE residual at 0, T/2 and T, using spectral spatial derivatives and a fourth-order centered time difference. This requires a smooth reference near both time endpoints. It is a numerical check, not a symbolic identity or an automatically verified exact solution.

Presets: heat diffusion, viscous Burgers, KdV, Kuramoto–Sivashinsky, the wave equation as a two-field system, 2D Allen–Cahn, 2D Gray–Scott, 2D Cahn–Hilliard, and an exact 2D advection–diffusion benchmark.

## Numerical method and limits

- Radix-two Fourier transforms in one or two dimensions, with Float64 arrays.
- The retained band is `|mode| < N/4` on each axis. The initial condition and every nonlinear right-hand side are projected onto this band. N denotes collocation points per axis, not retained modes. This band avoids aliases into retained modes for products of up to three band-limited factors. General non-polynomial or higher-degree nonlinearities still require resolution studies.
- Constant-coefficient, same-field linear terms are extracted from the expression tree and integrated with diagonal ETDRK4. Phi functions are evaluated by convergent series near zero and recurrences away from zero, avoiding small-argument cancellation.
- Coupled linear derivatives, variable-coefficient terms and nonlinear derivatives remain explicit. They may impose strong time-step restrictions even when the diagonal part is treated exponentially. There is no general stability guarantee for a typed expression.
- Every run lands on T using `steps = ceil(T/requested_dt)` and `actual_dt = T/steps`. The actual value is recorded in exports. Saved frames are selected from time-step endpoints; the space–time image arranges them in chronological rows (spacing is approximately uniform).
- 1D grids: 16–1024 points. 2D grids: 16–128 points per axis. Maximum three fields, 121 saved frames, 40,000 steps, and a work limit of 90 million field-grid-point steps. Refinement respects these limits; use a smaller base run if a doubled grid cannot be computed.
- Non-finite values or excessive amplitudes stop the computation with an explicit error. An overflow is not classified as mathematical blow-up. Fields are not clipped to impose positivity.
- Initial projection loss, mismatched boundary traces and spectral energy near the retained cutoff generate warnings. Boundary-value agreement alone does not establish smooth periodic compatibility. Mean and RMS are measurements; the mean is not assumed conserved for an arbitrary equation.
- Two-dimensional maps preserve the coordinate aspect ratio. The spectrum bins energy by absolute mode in 1D or `max(|mode_x|, |mode_y|)` shells in 2D.

Elliptic boundary-value problems, non-periodic boundaries, arbitrary geometries, unregularized shocks and constrained PDEs require other solvers. A second-order time equation can sometimes be rewritten as a first-order system (see the wave preset), but this does not remove explicit stability restrictions.

The original front-existence, far-field spectrum and weighted-energy arguments are specific to their models. The studio does not transfer those conclusions to user-defined equations.

Method reference: A.-K. Kassam and L. N. Trefethen, [Fourth-Order Time-Stepping for Stiff PDEs](https://people.maths.ox.ac.uk/trefethen/fourth-order.pdf), SIAM Journal on Scientific Computing 26 (2005), 1214–1233. This software is a separate implementation, with its own tested scope.

## Independent Python check

Download **Python reference**, or use `research/studio_reference.py`. Install NumPy and SciPy, then run:

```sh
python studio_reference.py phaseatlas-custom-experiment.json --output comparison.json
```

Use `--method BDF` for an implicit small-grid reference. The default is SciPy DOP853 with relative tolerance 1e-9 and absolute tolerance 1e-11. The reference uses NumPy FFT rather than the JavaScript FFT and a different time integrator. It compares the final fields with the browser export.

This independent checker is limited to N ≤ 128 in 1D or N ≤ 32 per axis in 2D. Export a smaller-grid experiment before running the check. The periodic spatial discretization and projection are intentionally matched: agreement checks independent implementations and time integration, not the continuum error.

## Validation recorded for this release

- Thirteen new automated numerical/parser tests: FFT round trip, 2D Laplacian, ETD coefficients, exact diffusion and advection benchmarks, dispersion signs, wrong-reference detection, nonlinear fourth-order time convergence, time-dependent forcing, coupled waves, conservative fourth-order evolution, nested-grid comparison, and invalid/unsupported input handling.
- Three independent small-grid comparisons using SciPy DOP853: Burgers N=64, T=0.5; Gray–Scott N=16², T=2; Cahn–Hilliard N=16², T=0.1. Relative differences from the browser were approximately 1.20e-10, 4.42e-13 (largest field), and 2.01e-15 respectively. These are limited regression examples, not accuracy certificates for all settings.
- Browser checks cover desktop/mobile English UI, actual worker computation, refinement, JSON/CSV/SVG/WebM exports, sharing without automatic execution, invalid equations, import recomputation, cancellation, and navigation from the original laboratory.

Run `npm test` for both the original front tests and the new studio tests. The browser script is `tests/studio_browser_qa.mjs`; it uses local Playwright/Edge and defaults to `http://127.0.0.1:8766`. Set `PHASEATLAS_TEST_URL` to test a different local port.

## Practical research use

The studio is suited to model exploration, teaching, reproducible figure generation, checking signs and scales, and sharing a small computational experiment with a collaborator. For physical prediction, users must supply a justified model, units, calibrated parameters, suitable boundary conditions and validation data. For a theoretical paper, experiments can motivate a conjecture and identify regimes to analyze; they do not establish a new theorem.

Future solver backends can be added behind the same configuration/export interface. Non-periodic finite differences or finite elements, constrained systems, parameter continuation, and validated numerics should each have their own admissibility checks and benchmark suite instead of being presented as one universal solver.
