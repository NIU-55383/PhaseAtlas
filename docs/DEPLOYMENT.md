# Deploy PhaseAtlas on Render

PhaseAtlas is a static site. The numerical solver runs in a browser Web Worker. Python provides optional research tools, not a server backend.

Choose **New > Static Site** and connect the PhaseAtlas GitHub repository.

| Setting | Value |
|---|---|
| Name | `phaseatlas` |
| Branch | `main` |
| Root Directory | Leave empty |
| Build Command | `echo "Static assets ready"` |
| Publish Directory | `dist` |
| Environment Variables | None required |

The command is a no-op because deployable assets are already in `dist`. Static Site does not require a Python runtime, Start Command, regional application server, or Compute plan. No API key or server database is required.

Commit and push the complete project, including `dist/downloads`, to the selected branch before creating the site. A local change alone does not update GitHub or Render. Later deployments follow the site's Render auto-deploy settings.

Navigation uses URL fragments (`#lab`, `#atlas`, `#verify`, `#evidence`, `#theory`), so no SPA rewrite is required. Preserve the directory structure, including the worker modules, `data`, and `downloads`.

After deployment, open the hosted URL, run the default calculation, inspect the verification ledger, and download the JSON, toolkit ZIP and project PDF. Reload with `#atlas` in the URL and inspect the phone layout. See `ACCEPTANCE.md` for a longer review.

For local preview, run `python launch.py` or double-click `START_PhaseAtlas.cmd`. The launcher serves `dist` on `127.0.0.1:8765` or the next available port. Stop with Ctrl+C. Render serves the static assets directly.

Reference: [Render Static Sites documentation](https://render.com/docs/static-sites).
