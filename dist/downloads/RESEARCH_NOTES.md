# PhaseAtlas: methods, evidence, and scope

Version 0.1.0. This document accompanies executable source, not a claim of a new PDE theorem.

## 1. Equation and reference profiles

The conservation law is

\[
u_t=\gamma u_{xxxx}-\beta u_{xxx}+\alpha u_{xx}-\partial_x f(u),\qquad
f(u)=au^2+\frac{2b}{3}u^3.
\]

Use the moving coordinate \(\xi=x-ct\). For a traveling front, integration gives

\[
-cv+av^2+\tfrac{2b}{3}v^3+\beta v''=\alpha v'+\gamma v'''+C_1.
\]

The speed is constrained by the endstates:

\[
c=a(u_-+u_+)+\tfrac{2b}{3}(u_-^2+u_-u_++u_+^2).
\]

| Model | Parameters | Profile | Endstates |
|---|---|---|---|
| Cubic fourth order | a=0, b=315/16, alpha=-71/4, beta=-15/2, gamma=-1, c=105/8 | (1+exp(-xi))^(-3/2) | 0 to 1 |
| Burgers | a=1/2, b=0, alpha=1/2, beta=gamma=0, c=1/2 | (1+exp(xi))^(-1) | 1 to 0 |
| KdV-Burgers | a=-6, b=0, alpha=5, beta=1, gamma=0, c=-6 | (1+exp(-xi))^(-2) | 0 to 1 |

The cubic profile's half power is real and smooth because its base is strictly positive on the real line. The implementation uses a stable logistic formula, not a rounded exponent. This does not validate arbitrary fractional-power ansatzes with sign-changing bases.

Time and space are dimensionless model coordinates. No physical unit calibration is asserted.

## 2. Perturbation evolution

For a verified stationary profile v, write u=v+w. The code evolves

\[
w_t=Lw+N(w),\quad
L=\gamma D^4-\beta D^3+\alpha D^2+cD-D[f'(v)\,\cdot],
\]

\[
N(w)=-D\left[(a+2bv)w^2+\tfrac{2b}{3}w^3\right].
\]

Linear mode sets N=0. The variable-coefficient linear advection is included in the implicit matrix. SBDF2 advances

\[
(I-\tfrac23\Delta t L_h)w^{n+1}
=\tfrac43w^n-\tfrac13w^{n-1}
+\tfrac23\Delta t(2N_h(w^n)-N_h(w^{n-1})).
\]

The first step uses backward Euler for the linear part and forward evaluation of N. Interior centered differences are second-order. A pentadiagonal factorization is reused for each step. Explicit nonlinear terms still require time-step checks; the method is not advertised as unconditionally stable.

The cubic problem uses w=w_xi=0 at both finite endpoints with reflected ghost values for the derivative constraint. This is a clamped boundary, not an absorbing whole-line boundary. Its local boundary truncation differs from the interior stencil; the entire boundary-value discretization is checked using a manufactured clamped solution. Burgers needs only w=0. KdV-Burgers numerical evolution is disabled because a separate third-order boundary treatment has not been validated.

The Gaussian carrier packet is tapered by a C2 quintic window only in the outer quarter of the domain. The initial condition is unchanged on the common interior when comparing sufficiently large domains.

The perturbation scheme is well-balanced by construction. Zero initial perturbation remaining zero is not independent solver verification. Analytic residuals, a manufactured problem, refinement, and an independent time integrator provide separate checks.

## 3. Diagnostics and interpretation

The interface shows max|w|; the finite-domain L2 norm; a local L2 norm over |xi|<=5; and a weighted norm of exp(-2xi)w. Norm curves are normalized to their own initial values. The heatmap uses w/epsilon and a fixed color scale for the entire run. The disturbance plot likewise retains its vertical scale throughout a run. Exact translation has no perturbation norm.

The outer 20% of the spatial interval is monitored for disturbance energy. A warning at an energy fraction above 1e-4 recommends a larger domain. This is a heuristic diagnostic, not a proof of absence of boundary influence. Weighted norms can magnify left-tail roundoff. Changes in a finite-domain norm are not by themselves an absolute/convective instability classification. Clamped boundaries permit flux; conservation of mass is not asserted. Fourth-order models need not obey a second-order maximum principle.

The default cubic run uses L=24, N=2049, T=0.06, dt=0.000025, epsilon=0.001, packet center -5, width 1.5 and carrier k=sqrt(71/8). The maximum unweighted far-field growth rate is 5041/64, so this is already approximately 4.73 maximum growth times. T=1 is not an appropriate default linear illustration.

## 4. Far-field spectra and the weighted energy estimate

At a constant endstate U, the unweighted dispersion relation is

\[
\lambda(k)=\gamma k^4-\alpha k^2+i[\beta k^3+(c-f'(U))k].
\]

For the convention z=exp(eta xi)w, use nu=ik-eta in the operator polynomial gamma nu^4-beta nu^3+alpha nu^2+(c-f'(U))nu. For gamma<0, writing its real part as gamma k^4+B k^2+C gives

\[
\sup_k\Re\lambda=C-\frac{\max(B,0)^2}{4\gamma},
\quad B=-6\gamma\eta^2-3\beta\eta-\alpha.
\]

The atlas is this analytic endstate calculation. It does not determine a wave's point spectrum or prove that a heteroclinic front exists at every displayed parameter point.

For the cubic reference at eta=-2, the left and right real parts are respectively

\[
-k^4-\tfrac{13}{4}k^2-\tfrac34,
\qquad -k^4-\tfrac{13}{4}k^2-\tfrac{159}{2}.
\]

The stronger complete continuous linear energy identity uses g=315v^2/8:

\[
A=-D^4-\tfrac12D^3+\tfrac{13}{4}D^2+(\tfrac18-g)D-\tfrac34-2g-g',
\]

\[
\Re\langle z,Az\rangle=-\|z''\|_2^2-\tfrac{13}{4}\|z'\|_2^2
-\int(\tfrac34+2g+\tfrac12g')|z|^2\,d\xi
\le-\tfrac34\|z\|_2^2.
\]

For smooth decaying functions, boundary terms vanish and g,g'>=0. A full semigroup theorem additionally needs the operator-domain and generation argument. This estimate excludes translation: exp(eta xi)v' is square-integrable only for -3/2<eta<1. No nonlinear orbital stability theorem is claimed. The selected difference matrix is not assumed to inherit the continuous identity exactly.

For varied alpha,beta, the displayed conditional energy bound at eta=-2 is

\[
d_2=-24-6\beta+\alpha,\quad
C_0=-16-8\beta+4\alpha+2c,\quad
C_0+\max(-d_2,0)^2/4.
\]

It assumes an actual monotone 0-to-1 front with vv'>=0, gamma=-1 and c=105/8. A negative value is a sufficient conditional energy bound. A nonnegative value is inconclusive, not proof of instability.

## 5. Numerical candidate continuation

The fixed-speed traveling-wave ODE is

\[
v'=p,\quad p'=q,\quad q'=cv(1-v^2)+\alpha p-\beta q.
\]

Backward RK4 shooting starts near v=1 along a negative real root of r^3+beta r^2-alpha r+2c=0. The right initialization offset is 1e-7; the step is 0.003. The phase is aligned by v(0)=2^(-3/2). The interface confines this exploration to alpha in [-20,-15], beta in [-8.5,-6.5]. A bounded candidate with a small left-tail indicator is a numerical observation, not validated continuation, uniqueness or existence proof. Failed shooting is inconclusive. The reference candidate agrees with the exact profile to about 3.9e-8 on |xi|<8 in the tested calculation.

Changing coefficients while holding the old profile stationary would omit its new PDE residual and solve the wrong problem. The app therefore keeps perturbation evolution restricted to verified exact models. Atlas candidates are not silently fed into the evolution solver.

## 6. Executed verification

The checked-in machine-readable record lists actual measurements. The initial suite has 13 JavaScript tests. It covers exact residuals, deliberate sign errors, real-branch monotonicity, spectral bounds, the band solve, manufactured clamped boundary convergence, time and spatial refinement, small-amplitude linearization, domain extension, model boundaries and baseline shooting. Python/SymPy separately verifies exact identities for the three fronts.

Independent SciPy comparisons use independently assembled sparse derivative matrices. Linear comparison uses expm_multiply; nonlinear comparison uses adaptive BDF (rtol=2e-9, atol=1e-12). Measured final relative L2 differences were approximately 4.83e-5 (cubic linear), 1.91e-4 (default cubic nonlinear), and 1.53e-7 (Burgers nonlinear). These comparisons share the same spatial boundary problem, so spatial convergence is checked separately. They are not continuum error bounds. For the default experiment, jointly refining N=2049 to N=4097 and halving the time step changes the final perturbation by about 1.133% in relative L2, with a maximum absolute difference of 4.74e-4.

Temporal and spatial refinement error-difference ratios were about 3.96 and 3.95. Manufactured clamped problem RMS errors for 65,129,257 points were about 7.74e-5, 1.94e-5, 4.85e-6. A single click in the app can perform a joint spatial/time refinement for the current experiment, which measures sensitivity rather than a certified error bound.

## 7. Provenance, application, and future paper

The project builds on the user's earlier MAE03 research and subsequently corrected notes. The exact solutions and stability literature are prior structure. New work in this deliverable comprises the browser scientific workbench, numerical implementation, independent reference, verification workflow, interactive visualizations and reproducibility exports. Development was AI-assisted; no external LLM is called at runtime. The project makes no claim of autonomous theorem discovery.

Immediate users are nonlinear-wave researchers, scientific computing developers and instructors. They can audit formulas, generate controlled perturbation experiments, examine spectral mechanisms and share reproducible results. Pattern-formation equations motivate potential later physical links, but this parameter set has not been calibrated against an experiment or engineering system.

A future Nonlinearity submission requires a genuinely new mathematical statement, a literature gap and a proof. Useful directions include persistence of a heteroclinic family, rigorous spectral/pointwise analysis and nonlinear local-response estimates. These are research tasks, not completed platform features.

Primary references:

- Hu & Liu (2019), exact-wave background: https://www.aimspress.com/article/10.3934/math.2019.5.1450
- Johnson, Lyng & Smith, modified Kuramoto-Sivashinsky fronts: https://arxiv.org/abs/1810.02233
- Holzer & Scheel, pointwise growth criteria: https://arxiv.org/abs/1311.3685
- AUTO-07p: https://auto-07p.github.io/
- Nonlinearity scope: https://publishingsupport.iopscience.iop.org/journals/nonlinearity/about-nonlinearity/

The hosted review site is private. Local source availability does not by itself constitute an open-source release. The owner must choose licensing and sharing before a public competition submission.


