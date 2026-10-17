# PhaseAtlas: four-minute demo script

This is a presentation draft. Do not claim publication, experimental calibration, autonomous discovery, or a new stability theorem. The built-in WebM export supplies short scientific-animation clips; the complete four-minute narrated submission still requires the presenter to record their voice and screen.

## 0:00-0:30 | A researcher's problem

Screen: English Front laboratory, default cubic run, animation paused near its final time.

“A traveling front can look almost unchanged while small disturbances grow dramatically. A smooth animation alone cannot tell us whether the formula is correct, whether the solver is accurate, or what kind of stability we are observing. PhaseAtlas puts those questions in one reproducible workspace.”

Presenter note: start with the researcher's problem before introducing the full PDE.

## 0:30-1:20 | A real experiment, not a rendered illusion

Screen: rewind and play; point to the orange disturbance, fixed-scale heatmap and three norm curves. Switch moving/laboratory coordinates once.

“Our reference is a known cubic fourth-order front connected to my earlier MAE03 project. The platform evolves a localized wave packet with a real implicit-explicit solver. We show the original field and the disturbance separately. The heatmap keeps one color scale, so growth is not hidden by automatic normalization. Global, local and weighted norms can tell different stories. The weighted decay shown here is not a nonlinear orbital stability theorem.”

“Everything runs in a browser worker, without sending research data to an external service.”

Presenter note: emphasize computation and the fixed color scale. Do not claim automatic proof of convective stability.

## 1:20-2:00 | Find an error before building on it

Screen: Verify a solution. Reverse the speed sign, show nonzero residual, restore coefficients. Briefly show the N=3/2 explanation.

“Before trusting the experiment, we audit the formula. Reversing one speed sign produces a large residual. Restoring it brings the residual back to roundoff. An independent SymPy script verifies the exact identities. The half-integer exponent is legitimate here because its base stays strictly positive on the whole real line.”

Presenter note: use the deliberate error to make the practical value clear to a nonspecialist audience.

## 2:00-2:40 | Explore without overstating evidence

Screen: Spectrum & atlas. Move alpha slightly, show old-profile residual, then compute a candidate front and phase portrait.

“The parameter atlas shows an analytic far-field spectral bound. It is deliberately labeled separately from front existence. When coefficients change, the old exact profile is no longer silently treated as a solution. We compute a new numerical shooting candidate and expose its tail indicator. This supplies research hypotheses, not fabricated proofs.”

## 2:40-3:25 | Make it reusable

Screen: Evidence & export. Run refinement, show the measured discrepancy and verification ledger. Download JSON, then import it. Point to Python toolkit and SVG export.

“Another researcher can refine the mesh, inspect boundary contamination, export every time frame, and reproduce the run using an independently assembled SciPy implementation. The default nonlinear experiment agrees with that reference to about 0.0191 percent in the final perturbation's relative L2 norm on the same spatial mesh. Separate tests check spatial and time convergence. Figures are available as editable SVG, raw CSV, and scientific animations.”

Presenter note: 0.0191% compares independent integrators and matrix assembly on the same spatial mesh; it is not the total error relative to the continuous PDE.

## 3:25-4:00 | Contribution and next research question

Screen: Theory & research, then return to the front animation.

“The immediate contribution is a scientific software workflow: exact structure, controlled computation, visual explanation, and reproducible evidence. It can support wave researchers, solver developers and research teaching. My earlier mathematical work is the starting point; this software and its validation workflow are the new deliverable.”

“The next paper will pursue a new mathematical result, such as persistence of a front family and a rigorous local-response theory. The platform helps discover and test that question. It does not pretend that the interface itself proves the theorem.”

## Submission notes

The presentation is designed for a four-minute demo and a one-page write-up. Verify the organizer's current requirements and prior-work policy before submission. Hosting, licensing and author details are managed by the project owner.

Official source: https://llmhackathon.github.io/agenda/

