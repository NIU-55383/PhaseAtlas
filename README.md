# PhaseAtlas

## Current competition snapshot - 18 October 2026

The homepage now introduces the research workflow; the original wave laboratory is at `dist/front.html`. Latest submission copy, article, figures and scripts are in `dist/submission-2026/`. Numerical case data are in `dist/data/submission-2026/`. The package is a pre-event baseline, not a claim of work performed during the October 21-22 event.

Run `node research/build_submission_cases.mjs` to reproduce case arrays, `python research/submission_figures.py` for plots, and `python research/build_submission_documents.py` for PDFs (NumPy/Matplotlib and ReportLab/PyPDF respectively). The submission pack also includes the exact numerical source and tests. Read the submission kit for the unresolved 2026 form/legacy-guideline discrepancy.


A browser-based PDE research workspace connecting custom equations, exact fronts, numerical evolution, visual diagnostics, and reproducible evidence.

## Custom PDE Studio

Open `studio.html` through the local server, or select **Custom PDE studio** in the navigation. Write one to three coupled evolution equations in 1D or 2D, set parameters, initial data and boundary conditions, and inspect fixed-scale animations, space-time diagrams, means and RMS amplitudes. Twenty-one editable presets cover diffusion, nonlinear waves, phase/reaction dynamics, cooled and insulated rods, a heated plate, fourth-order boundary benchmarks, and the original MAE03 travelling front.

Periodic domains support derivatives through order four with Fourier ETDRK4. Bounded intervals and rectangles support Dirichlet and Neumann conditions independently on each field and edge, including time-dependent boundary data. This backend uses cell-centered finite volumes and SBDF2 for constant diagonal diffusion, reactions, and smooth transport with diffusion. It includes boundary mass-transfer diagnostics and explicit scope checks. A separate 1D fourth-order backend accepts two custom linear boundary conditions per endpoint, including value, slope, curvature, third normal derivative and linear combinations. It uses banded implicit solves for the complete constant diagonal linear operator and retains animation and refinement. All studio backends use a restricted mathematical parser and a cancellable Web Worker. This is not a solver for arbitrary PDEs or geometries; the original wave-front results remain model-specific.

Use **Check resolution** for separate time-step and spatial comparisons. Optional reference functions support trajectory comparisons and sampled PDE residual checks. Export complete JSON/CSV data, vector SVG figures, WebM animations or a configuration link. `research/studio_reference.py` provides independent small-grid checks with NumPy and SciPy. Read `docs/CUSTOM_PDE_STUDIO.md` for syntax, admissible models, benchmarks and limitations.

## Start

On Windows, double-click **START_PhaseAtlas.cmd**, or run:

```powershell
python launch.py
```

The launcher serves `dist/` on localhost and opens a browser. It requires Python 3.10+ but no Python scientific packages for the website. Do not open `index.html` with `file://`: JavaScript modules and workers need HTTP. Chrome or Edge is recommended for WebM export.

Keep the website and research tools together in the PhaseAtlas repository. On Render, use a **Python 3 Web Service** with `pip install -r requirements.txt` as the Build Command and `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --access-logfile - --error-logfile -` as the Start Command. Set Health Check Path to `/healthz`. Commit and push these server files before deploying. See `docs/DEPLOYMENT.md` for every dashboard setting.

The Flask application serves only `dist/` and exposes a deployment health check. Scientific evolution still runs in browser workers. Server-side simulation, accounts, persistent experiments, and background jobs are future features, not enabled by choosing Web Service alone.

To check the server routes after installing the root requirements, run `python -m unittest discover -s tests -p test_server.py`. Gunicorn runs on Linux (including Render); keep using `python launch.py` for the dependency-free Windows preview.

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
- `docs/DEPLOYMENT.md`: Render Web Service setup and deployment checks.
- `docs/DESIGN.md`: visual system and the supplied Imperial Beamer palette.
- `docs/RESEARCH_NOTES.md`: equations, solver, validation, caveats and provenance.
- `docs/DEMO_SCRIPT.md`: four-minute presentation script.
- `docs/project-brief.html` / `docs/PhaseAtlas_Project_Brief.pdf`: one-page project summary.
- `dist/data/verification.json`: measured validation record.
- `docs/figures/`: scientific figures from an actual computation.

## Scope

This is a specialized research workbench, not a general-purpose PDE solver. Numerical observations are not rigorous existence or nonlinear stability proofs. The exact front is prior mathematical structure; the new deliverable is the integrated software and reproducibility workflow. A future Nonlinearity paper must establish a new mathematical result independently of the quality of the interface.

The interface makes no external LLM requests. Development was AI-assisted; calculations are deterministic numerical and symbolic procedures. No API key is required. No experimental calibration or engineering performance is claimed. License selection and any public source release remain with the project owner.

## 3D space-time surfaces

After a 1D run, **PDE Studio** and **Research Workbench** show an **x–t–amplitude** surface below the existing plots. It supports pointer rotation, keyboard rotation/tilt, zoom, an independent saved-frame player synchronized with the original view, progressive reveal, and a 2400 × 1600 PNG export. Select a field in Studio or apply an observation expression in Workbench; the surface follows that selection. Height can show the field/observation or its pointwise change from the first saved frame. Studio also offers signed difference from a supplied reference formula, when present. This comparison is not automatically an error against an exact solution.

The axes use actual saved times and the solver's coordinates (periodic nodes or bounded cell centers). Display mesh sampling is capped at 113 spatial points and 73 saved times, includes the first/last samples, and never changes trajectories, JSON/CSV exports, or refinement checks. All saved values determine a fixed vertical/color scale; difference views use a symmetric scale. The periodic seam is not duplicated and bounded face values are not reconstructed. A dark overlaid curve marks the selected frame. 2D spatial models keep their existing x–y field/surface views.

For the original research example, choose **MAE03 · 3/2-power travelling front**, run, then scroll to **3D space-time surface**. The perturbed MAE03 preset also supports a signed reference-difference surface.
