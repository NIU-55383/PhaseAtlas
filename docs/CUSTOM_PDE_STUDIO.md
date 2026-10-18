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

Choose a periodic interval/rectangle or a bounded interval/rectangle. Periodic coordinates are `[-Lx/2, Lx/2)` and `[-Ly/2, Ly/2)`, with derivatives through total order four. Bounded domains include both end faces and support constant non-negative diagonal diffusion, reactions, forcing, and smooth first-derivative transport with positive diffusion in the differentiated field and direction. All quantities are in user-chosen consistent units; examples are dimensionless.

| Input | Meaning |
| --- | --- |
| `u`, `v`, `w` | Active dependent fields, in that fixed order |
| `x`, `y`, `t` | Position and time; y is available only in 2D |
| `Lx`, `Ly`, `pi`, `e` | Domain lengths and mathematical constants |
| `Dx(u,1)` or `D(u,1)` | First x derivative |
| `Dx(u,4)` | Fourth x derivative, periodic mode only |
| `Dy(v,2)` | Second y derivative |
| `lap(u)` | Laplacian: u_xx in 1D, u_xx + u_yy in 2D |
| `biharm(u)` | Squared Laplacian, including the 2u_xxyy term in 2D; periodic only |
| `lap(u^3)` | A derivative acting on a nonlinear expression; periodic only |
| `sin cos tanh exp log sqrt abs min max` | Allowed mathematical functions |
| `+ - * / ^` | Arithmetic; multiplication must be explicit |

Use parameters such as `nu=0.1; c=2*nu`. Parameters can reference earlier parameters. Coordinates, field names, function names and built-in constants are reserved. Initial formulas depend only on coordinates and parameters. Optional reference formulas may also depend on t. When all fields have references, the studio checks their initial match and samples the PDE residual at 0, T/2 and T, using the selected spatial discretization and a fourth-order centered time difference. Bounded references are also checked against boundary data at sampled positions and times; a small discrete PDE residual does not prove a continuous identity. This requires a smooth reference near both time endpoints. It is a numerical check, not a symbolic identity or an automatically verified exact solution.

Presets: heat diffusion, viscous Burgers, KdV, Kuramoto–Sivashinsky, the wave equation as a two-field system, 2D Allen–Cahn, 2D Gray–Scott, 2D Cahn–Hilliard, an exact 2D advection–diffusion benchmark, a cooled rod, an insulated rod, a heated rod with an insulated tip, a mixed-boundary heated plate, and insulated 2D Allen–Cahn dynamics.

## Periodic numerical method and shared limits

- Radix-two Fourier transforms in one or two dimensions, with Float64 arrays.
- The retained band is `|mode| < N/4` on each axis. The initial condition and every nonlinear right-hand side are projected onto this band. N denotes collocation points per axis, not retained modes. This band avoids aliases into retained modes for products of up to three band-limited factors. General non-polynomial or higher-degree nonlinearities still require resolution studies.
- Constant-coefficient, same-field linear terms are extracted from the expression tree and integrated with diagonal ETDRK4. Phi functions are evaluated by convergent series near zero and recurrences away from zero, avoiding small-argument cancellation.
- Coupled linear derivatives, variable-coefficient terms and nonlinear derivatives remain explicit. They may impose strong time-step restrictions even when the diagonal part is treated exponentially. There is no general stability guarantee for a typed expression.
- Every run lands on T using `steps = ceil(T/requested_dt)` and `actual_dt = T/steps`. The actual value is recorded in exports. Saved frames are selected from time-step endpoints; the space–time image arranges them in chronological rows (spacing is approximately uniform).
- 1D grids: 16–1024 points. 2D grids: 16–128 points per axis. Maximum three fields, 121 saved frames, 40,000 steps, and a work limit of 90 million field-grid-point steps. Refinement respects these limits; use a smaller base run if a doubled grid cannot be computed.
- Non-finite values or excessive amplitudes stop the computation with an explicit error. An overflow is not classified as mathematical blow-up. Fields are not clipped to impose positivity.
- Initial projection loss, mismatched boundary traces and spectral energy near the retained cutoff generate warnings. Boundary-value agreement alone does not establish smooth periodic compatibility. Mean and RMS are measurements; the mean is not assumed conserved for an arbitrary equation.
- Two-dimensional maps preserve the coordinate aspect ratio. The spectrum bins energy by absolute mode in 1D or `max(|mode_x|, |mode_y|)` shells in 2D.

Elliptic boundary-value problems, arbitrary geometries, unregularized shocks and constrained PDEs require other solvers. A second-order time equation can sometimes be rewritten as a first-order system (see the wave preset), but this does not remove explicit stability restrictions.

The original front-existence, far-field spectrum and weighted-energy arguments are specific to their models. The studio does not transfer those conclusions to user-defined equations.

Method reference: A.-K. Kassam and L. N. Trefethen, [Fourth-Order Time-Stepping for Stiff PDEs](https://people.maths.ox.ac.uk/trefethen/fourth-order.pdf), SIAM Journal on Scientific Computing 26 (2005), 1214–1233. This software is a separate implementation, with its own tested scope.

## Dirichlet and Neumann experiments

Choose **Cooled rod · Dirichlet**, **Insulated rod · Neumann**, or **Heated plate · mixed 2D** for a benchmark. The **Domain boundary** selector can set all faces to zero Dirichlet or zero Neumann, or enable custom data. Each field has its own condition on each edge. Editing an edge switches the selector to custom mode.

- Dirichlet prescribes the field itself: `u = g`.
- Neumann prescribes the **outward normal derivative**: `∂n u = q`. Left: `−u_x`; right: `+u_x`; bottom: `−u_y`; top: `+u_y`.
- Zero Neumann implies zero **diffusive** flux. For temperature with conductivity k, outward heat flux is `−k ∂n u`; enter `−outward_flux/k`, not the flux itself. Zero diffusive flux does not suppress advective transport.
- Boundary expressions use coordinates, t, domain lengths and parameters. They cannot depend on unknown fields or derivatives. For example, a left wall can use `1+0.2*sin(t)`; a 2D wall can vary along its edge using `y` or `x`.
- Opposite faces need not share a type. Choose left Dirichlet 1 and right Neumann 0 for a heated rod with an insulated tip. Two-dimensional corners are represented by adjacent faces, without inventing a separate corner value. Inconsistent corner traces or initial/boundary data can reduce regularity and accuracy.

For the exact test `u=x+0.5+t` on a unit interval, enter RHS `nu*lap(u)+1`, initial data `x+0.5`, left Dirichlet `t`, right Dirichlet `1+t`, and the reference above. For the steady profile `u=x`, Neumann data are −1 at the left and +1 at the right. These examples make the sign and time conventions explicit.

### Bounded numerical method

The unknowns are cell-center values, with `h=L/N` and centers `−L/2+(i+0.5)h`. There is no periodic wrap or Fourier projection. Constant diffusion may differ by field and axis, for example `ax*Dx(u,2)+ay*Dy(u,2)`, with non-negative ax and ay. Spatial derivatives must act directly on a field: use `u*Dx(u,1)` for smooth Burgers transport, not `Dx(u^2,1)/2`.

Diffusion is discretized by face fluxes. The exterior ghost value is `2g−u_cell` for Dirichlet data and `u_cell+h*q` for outward Neumann data at either end. Centered interior first derivatives use a quadratic Dirichlet closure or the specified Neumann derivative. This backend is intended for smooth diffusion-dominated problems; centered transport has no shock-capturing or positivity guarantee.

Write the semidiscrete equation as `u'=L u+b(t)+R(u,t)`, with constant diffusion matrix L, boundary forcing b, and explicit reaction/transport R. After one backward-Euler diffusion / explicit-Euler reaction startup step, the method is

`(3/2 I−dt L) u[n+1] = 2u[n]−u[n−1]/2 + dt*(2R[n]−R[n−1]+b(t[n+1]))`.

This is SBDF2. Time-varying boundary forcing is evaluated at the new time. Each implicit system is solved by matrix-free, diagonally preconditioned conjugate gradients, stopping at residual norm `≤1e-11*max(1,||rhs||₂)`. Failure to reach tolerance stops the run. The diffusion solve does not remove stability restrictions from explicit reaction or transport. Second-order convergence is verified on smooth benchmarks, not guaranteed for incompatible, nonsmooth, or stiff arbitrary inputs.

General third-/fourth-order PDEs need additional boundary conditions and are rejected in this mode. Cross diffusion, variable/nonlinear diffusivity, mixed second derivatives and pure transport require other backends. They are not silently given periodic or zero extra conditions. The periodic fourth-order presets remain available.

### Bounded visualization and checks

- One-dimensional plots connect cell centers to the supplied/reconstructed boundary face values; the last value is not joined to the first. Neumann face values are reconstructed from the adjacent cell and prescribed derivative. Two-dimensional maps display cell values with physical aspect ratio; the y=0 space–time slice interpolates between the two central rows.
- Mass is the sum of cell values times cell volume. The diagnostic panel displays net **diffusive mass input** `∫ D ∂n u ds`; positive values add mass. Reaction, source and advective contributions are excluded. Zero input should preserve mass in a diffusion-only model, but not in an arbitrary reacting model.
- Initial boundary mismatches trigger a warning; initial states are not silently replaced. Reference boundary checks sample each side (five tangential positions in 2D), using numerical normal derivatives for Neumann data. They do not establish compatibility everywhere.
- Resolution checks first halve dt at the same N, then double N at that smaller dt. Fine-grid cell-center values are linearly/bilinearly interpolated to coarse centers. The reported spatial difference includes interpolation error; it is a comparison, not a rigorous error bound. Periodic comparisons continue to use coincident nodes.
- JSON retains per-edge formulas, cell-centered grid layout, boundary face values, mass, diffusive mass input, reference checks and implicit-solve diagnostics. CSV exports the actual cell-center coordinates and all field values. SVG and WebM include the bounded-domain label. Share links and imports preserve boundary settings.

## Independent Python check

Download **Python reference**, or use `research/studio_reference.py`. Install NumPy and SciPy, then run:

```sh
python studio_reference.py phaseatlas-custom-experiment.json --output comparison.json
```

Use `--method BDF` for an implicit small-grid reference. The default is SciPy DOP853 with relative tolerance 1e-9 and absolute tolerance 1e-11. The reference uses NumPy FFT for periodic domains, or an independent NumPy implementation of finite-volume stencils and boundary closures for bounded domains, together with a different time integrator. It compares the final fields with the browser export.

This independent checker is limited to N ≤ 128 in 1D or N ≤ 32 per axis in 2D. Export a smaller-grid experiment before running the check. The spatial discretization (including periodic projection or bounded boundary closures) is intentionally matched: agreement checks independent implementations and time integration, not the continuum error.

## Validation recorded for this release

- Thirteen periodic-studio numerical/parser tests: FFT round trip, 2D Laplacian, ETD coefficients, exact diffusion and advection benchmarks, dispersion signs, wrong-reference detection, nonlinear fourth-order time convergence, time-dependent forcing, coupled waves, conservative fourth-order evolution, nested-grid comparison, and invalid/unsupported input handling.
- Three independent small-grid comparisons using SciPy DOP853: Burgers N=64, T=0.5; Gray–Scott N=16², T=2; Cahn–Hilliard N=16², T=0.1. Relative differences from the browser were approximately 1.20e-10, 4.42e-13 (largest field), and 2.01e-15 respectively. These are limited regression examples, not accuracy certificates for all settings.
- Fourteen boundary tests cover Dirichlet/Neumann/mixed benchmarks, nonzero and time-dependent data, 2D tangential boundary formulas, anisotropic diffusion, separate conditions on coupled fields, mass input, spatial/temporal refinement, first derivatives, grid alignment and unsupported models.
- Five independent bounded-grid SciPy comparisons are recorded in `dist/data/boundary-validation.json`; the largest relative final-field difference is approximately 4.01e-7 for the recorded steps and grids. Reproduce them with `node tests/boundary_reference_fixtures.mjs` and `python research/check_boundary_reference.py`.
- Browser checks cover desktop/mobile English UI, actual worker computation, refinement, JSON/CSV/SVG/WebM exports, sharing without automatic execution, invalid equations, import recomputation, cancellation, and navigation from the original laboratory.

Run `npm test` for the original front tests and both studio backends. The browser script is `tests/studio_browser_qa.mjs`; it uses local Playwright/Edge and defaults to `http://127.0.0.1:8766`. The companion `tests/boundary_browser_qa.mjs` checks boundary controls, time-dependent endpoints, mixed 2D fields, mass diagnostics, animation, export, refinement, import and sharing. Set `PHASEATLAS_TEST_URL` to test a different local port.

## Practical research use

The studio is suited to model exploration, teaching, reproducible figure generation, checking signs and scales, and sharing a small computational experiment with a collaborator. For physical prediction, users must supply a justified model, units, calibrated parameters, suitable boundary conditions and validation data. For a theoretical paper, experiments can motivate a conjecture and identify regimes to analyze; they do not establish a new theorem.

Future solver backends can be added behind the same configuration/export interface. Higher-order bounded problems, variable/cross diffusion, finite elements, constrained systems, parameter continuation, and validated numerics should each have their own admissibility checks and benchmark suite instead of being presented as one universal solver.
