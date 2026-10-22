# PhaseAtlas: current presentation script

Author: Niu Te, Imperial College London. Presentation materials.

0:00-0:35 | The problem
Homepage: show the real cooling animation.
A PDE animation can look convincing even when its boundary conditions or numerical resolution are wrong. I built PhaseAtlas to connect the picture to the evidence behind it. It is a browser workbench for researchers who want to edit a model, inspect its dynamics and share a calculation that another person can check.

0:35-1:15 | A practical question
Cooling case: open its model in the workbench, run and play.
Start with a hot rod exchanging heat with its surroundings. The Robin boundary condition represents that exchange. I can change the diffusion coefficient or the exchange coefficient, run the equation and inspect the temperature through time. The model, initial data and boundary conditions remain visible. This is a dimensionless model study; I am not claiming it predicts a particular material without calibration.

1:15-1:55 | Check the calculation
Robin benchmark: run the three-space-level study.
To test the boundary implementation, I use a heat-equation mode with a known exact solution. I hold the time step fixed and refine the grid from sixteen to thirty-two to sixty-four cells. The measured errors decrease, and the observed order is approximately two. A separate balance audit compares the thermal-content change with the input through the walls. Neither a smooth animation nor a small algebraic residual is used as an accuracy certificate.

1:55-2:35 | Compare a family of experiments
Show the cooling parameter map; select one cell and replay.
Now I turn one run into a parameter question: how much heat remains after a fixed time? Each map cell stores a real numerical trajectory. I can choose a mean, a local probe or a threshold event. Failed runs stay visible, and an event that was not observed is left missing. This is a finite-time parameter scan, not a bifurcation diagram.

2:35-3:15 | The original research connection
Front laboratory: play disturbance map and point to norm curves.
The second case comes from my earlier work on a fourth-order travelling front. PhaseAtlas retains that mathematical structure while letting me distinguish motion from deformation. Global, local and weighted norms can behave differently. The general Studio also lets a researcher specify two linear boundary conditions at each end for supported fourth-order equations. These calculations support research questions; they do not prove nonlinear stability.

3:15-3:55 | Reuse and contribution
Evidence export, article and reproducibility download.
The contribution is a connected workflow: editable equations, visual experiments, numerical checks and a portable research record. The present suite passes ninety mathematical and numerical tests, with an independent Python reference for selected problems. Computation runs on the user's device. I used AI assistance in development, while the solver itself is deterministic and needs no language-model API. The package identifies its pre-event baseline so later hackathon contributions can be recorded honestly. I am Niu Te from Imperial College London. This is PhaseAtlas: from PDE animations to reproducible numerical evidence.

See dist/submission-2026/PhaseAtlas_Submission_Kit.pdf for current requirements, caveats and the two-minute alternative.
