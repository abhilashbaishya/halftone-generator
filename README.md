# Halftone Studio

Halftone generator for brand design work.

## Local preview

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Free public hosting (GitHub Pages)

1. Create a new GitHub repo and push this project to the `main` branch.
2. In the repo, open **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main` (or re-run the workflow) and wait for the `Deploy static site to GitHub Pages` workflow to finish.
5. Your public URL will be:
   - `https://<your-github-username>.github.io/<repo-name>/`

## Files

- `index.html`
- `styles.css`
- `script.js`
- `.github/workflows/deploy-pages.yml`
