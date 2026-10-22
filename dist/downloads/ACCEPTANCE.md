# PhaseAtlas acceptance walkthrough

Run `python launch.py` or double-click `START_PhaseAtlas.cmd`. Modules and Web Workers need HTTP; do not open `dist/index.html` directly.

## Ten-minute review

1. **Observe the reference front.** Pause and scrub the default cubic run. Inspect the blue field, orange disturbance, fixed-scale space-time map, and three norm histories.
2. **Change a parameter.** Increase amplitude from 0.001 to 0.002 and run again. Changing an input alone retains the previous computation.
3. **Compare coordinates.** Switch moving and laboratory coordinates. The field and disturbance use the same transformation, x = xi + ct.
4. **Compare models.** Burgers supports perturbation evolution. KdV-Burgers provides analytic translation and residual verification; its third-order boundary solver is not implemented.
5. **Explore the atlas.** Change alpha, beta, or eta. The map gives a constant-endstate spectral bound. Changing coefficients generally invalidates the original profile. Compute a shooting candidate and inspect its phase portrait and tail indicator.
6. **Detect an error.** Reverse the speed sign in Verify a solution. Restore the coefficients to return the residual to roundoff. Read why the positive base permits the exponent 3/2.
7. **Refine the mesh.** Run the default cubic nonlinear experiment and choose Refine & compare in Evidence & export. Both spatial and time steps halve. The final difference is a sensitivity check, not a rigorous error bound, and enters the JSON export.
8. **Export and reproduce.** Download JSON, CSV, SVG, and HTML. Import the JSON to recompute its parameters. Export charts with their PNG buttons.
9. **Record an animation.** Export WebM and keep the page open for approximately 12 seconds. Chrome or Edge supports the recording APIs. Actual computed frames include parameters, coordinates, and time.
10. **Inspect phone width.** The interface is entirely English. Controls appear before charts, without horizontal page overflow.

## Files

- `dist/`: deployable static site, solver, worker, data and downloads.
- `research/phaseatlas.py`: independent SciPy reference and SymPy identities.
- `research/make_figures.py`: PNG, SVG and PDF research figures.
- `tests/science.test.mjs`: mathematical and numerical tests.
- `tests/browser_qa.mjs`: browser workflow and responsive checks; requires Playwright.
- `dist/data/verification.json`: executed verification results.
- `docs/RESEARCH_NOTES.md`: equations, methods, limitations and provenance.
- `docs/DEMO_SCRIPT.md`: English four-minute presentation.
- `docs/PhaseAtlas_Project_Brief.pdf`: one-page introduction.
- `docs/figures/`: four groups of scientific figures.
- `dist/downloads/phaseatlas-research.zip`: portable source and research toolkit.

## Scope

This specialized workbench serves nonlinear-wave researchers, solver developers and instructors. Computation is deterministic and local, without API keys. It is not an arbitrary-PDE solver.

Shooting candidates, finite-time norm histories and far-field bounds do not establish nonlinear orbital stability. A weighted curve alone does not classify absolute or convective instability. Coefficients are not calibrated to experimental data.

A future Nonlinearity paper needs a new mathematical contribution and a verified literature gap. This platform supports that work; it does not claim completed persistence, nonlinear stability or interval-arithmetic proofs.

The presentation identifies earlier Fourth-order research as its mathematical foundation and the software as the new deliverable. Check the organizer's current requirements, prior-work policy and author details before submission. Hosting instructions are in `DEPLOYMENT.md`.
