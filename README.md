# The Element Atlas

An interactive 3D guide to all 118 elements and 238 compounds: nucleus and quarks, electron orbitals, bonding, live molecule simulations (pairs, clusters and bulk, with lone pairs, electron clouds and hydrogen bonds), bond angles and lengths, real sample photos, and a dark or light theme.

## Layout

| Path | What it is |
| --- | --- |
| `atlas/` | **The single source** of the app, used both for the website and the Claude Artifact |
| `web/` | Website-only extras: favicon, 404 page, robots.txt |
| `site/` | The built website (generated, not stored in Git) |
| `build/make-site.ps1` | Builds `site/` from `atlas/` and `web/` |
| `.github/workflows/pages.yml` | Publishes the website to GitHub Pages on every push to `main` |
| `atlas/index.html` | The page, styles and layout |
| `atlas/js/core.js` | Data loading, theme, routing, search, full screen |
| `atlas/js/scenes.js` | three.js scenes: atoms, orbitals, molecules, crystals, molecule simulation |
| `atlas/js/views.js` | The four views: periodic table, element explorer, compounds, combine |
| `atlas/data/` | `elements.json`, `compounds.json`, `photos.json` |
| `atlas/img/` | Element photos from Wikimedia Commons |
| `build/` | PowerShell scripts that build and correct the data (not deployed) |
| `build/corrections.json` | Fact-check corrections confirmed by two independent referees |
| `water-electron-lab.html` | The original single-page water simulation |

## Build and preview the website

`atlas/index.html` is written for the Claude Artifact host, which wraps it in a document skeleton. The build adds that skeleton (doctype, charset, mobile viewport, description and share tags) so it works on any web host:

```
powershell -ExecutionPolicy Bypass -File build/make-site.ps1
powershell -ExecutionPolicy Bypass -File .claude/serve.ps1 -Root site -Raw -Port 8772
```

then open http://localhost:8772. Opening `index.html` directly from disk will not load the data files.

## Publish

**GitHub Pages (automatic).** `.github/workflows/pages.yml` builds `site/` and publishes it on every push to the `main` branch. One-time setup, in this order:

1. Create the repository on GitHub, empty (no README or license), and **public**: free GitHub accounts can publish Pages only from public repositories.
2. In the repository, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push the `main` branch (this repository's history starts on `main`; if you ever re-create it, use `git init -b main`, because Git's own default name is `master` and the workflow only runs for `main`):

   ```
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```

4. Watch **Actions → Publish website**. The site appears at `https://<user>.github.io/<repo>/`.

If you pushed before step 2, the first run fails at "configure-pages" with "Get Pages site failed". After step 2, open that run and choose **Re-run all jobs**, or use **Actions → Publish website → Run workflow**.

**Any other static host** (Cloudflare Pages, Netlify): run the build and upload the `site/` folder (about 5.5 MB).

## Sources and credits

- Element data starts from PubChem's periodic table, cross-checked against IUPAC/CIAAW, NIST and the CRC Handbook.
- 3D molecule coordinates for many compounds come from PubChem (public domain).
- Photos come from Wikimedia Commons; each photo's author, license and source link are shown in the page and stored in `atlas/data/photos.json`. Keep these credits when sharing.
- 3D rendering uses three.js r128 (MIT license), loaded from public CDNs.
- Simulations are simplified models for teaching; simulated melting and boiling temperatures are approximate.
