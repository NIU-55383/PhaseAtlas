# PhaseAtlas

A browser-based nonlinear wave laboratory connecting exact fronts, numerical evolution, visual diagnostics, and reproducible evidence.

## Start

On Windows, double-click **START_PhaseAtlas.cmd**, or run:

```powershell
python launch.py
```

The launcher serves `dist/` on localhost and opens a browser. It requires Python 3.10+ but no Python scientific packages for the website. Do not open `index.html` with `file://`: JavaScript modules and workers need HTTP. Chrome or Edge is recommended for WebM export.

Keep the website and research tools together in the PhaseAtlas repository. For Render, create a **Static Site**, use `main`, leave Root Directory empty, set Build Command to `echo "Static assets ready"`, and Publish Directory to `dist`. See `docs/DEPLOYMENT.md` for the complete setup.

## What works

- Cubic fourth-order front: exact translation, linear and nonlinear perturbation evolution.
- Burgers shock: exact translation, linear and nonlinear evolution.
- KdV-Burgers front: exact translation, formula residual and analytic dispersion support; no third-order numerical boundary evolution.
- Animated front and disturbance; fixed-scale space-time heatmap; global, local, and exponentially weighted norm histories.
- Far-field spectral atlas and bounded numerical shooting continuation near the cubic reference.
- Analytic residual inspector, including deliberate sign-error detection and the N=3/2 real-branch explanation.
- One-click joint spatial/time refinement; boundary-buffer monitoring; evidence labels.
- JSON, CSV, SVG, PNG, standalone HTML report, and WebM animation exports; JSON import and local parameter history.
- English interface; mobile layout; local computation after serving assets.

## Reproduce the science

```powershell
python -m pip install -r research/requirements.txt
python research/phaseatlas.py --verify
python research/phaseatlas.py --config your-export.json --output reference.json
node --test tests/science.test.mjs
node research/make_fixtures.mjs
python research/validate_reference.py
```

The Python reference uses independently assembled sparse matrices with SciPy `expm_multiply` or BDF. The browser uses a dependency-free pentadiagonal SBDF2 solver in a Web Worker.

For editable scientific figures:

```powershell
python -m pip install matplotlib
python research/make_figures.py --input your-export.json --output figures
```

This generates four groups of PNG, SVG and PDF figures. `04_reference_dispersion` always describes the cubic reference and is titled accordingly.

## Read first

- `docs/ACCEPTANCE.md`: acceptance walkthrough.
- `docs/DEPLOYMENT.md`: Render Static Site setup.
- `docs/DESIGN.md`: visual system and the supplied Imperial Beamer palette.
- `docs/RESEARCH_NOTES.md`: equations, solver, validation, caveats and provenance.
- `docs/DEMO_SCRIPT.md`: four-minute presentation script.
- `docs/project-brief.html` / `docs/PhaseAtlas_Project_Brief.pdf`: one-page project summary.
- `dist/data/verification.json`: measured validation record.
- `docs/figures/`: scientific figures from an actual computation.

## Scope

This is a specialized research workbench, not a general-purpose PDE solver. Numerical observations are not rigorous existence or nonlinear stability proofs. The exact front is prior mathematical structure; the new deliverable is the integrated software and reproducibility workflow. A future Nonlinearity paper must establish a new mathematical result independently of the quality of the interface.

The interface makes no external LLM requests. Development was AI-assisted; calculations are deterministic numerical and symbolic procedures. No API key is required. No experimental calibration or engineering performance is claimed. License selection and any public source release remain with the project owner.
