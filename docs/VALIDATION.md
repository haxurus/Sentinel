# Validation - v0.3.0

Checks performed before the repository's initial commit:

- parsing of all `package.json` files: OK;
- YAML parsing of Compose, GitHub Actions workflows, and Dependabot: OK;
- `sh -n` on scripts under `ops/`, `security/`, `docker/`, and `scripts/`: OK;
- syntax transpilation of all TypeScript/TSX files: 22 files, 0 syntax errors;
- TypeScript compilation of the `@sentinel/shared` package: OK;
- verification that the source DB hardening script matches the production runtime copy: OK;
- verification that old Celestia namespaces/names are absent: OK;
- verification that no real secret files are present in the tree: OK;
- verification that the Discord token is not passed to API/web: OK for the Compose architecture;
- verification of separate PostgreSQL networks/credentials for API and bot: OK for the configuration;
- API health endpoint with database verification added;
- bot health endpoint tied to `client.isReady()` added.

## Generation environment limitations

The generation environment network did not complete `npm install`, so a full local build with all real npm dependencies could not be run.

Docker CLI is not available in the generation environment, so `docker compose config` and image builds are verified by GitHub CI on the first Pull Request/build.

The `.github/workflows/ci.yml` pipeline runs:

1. shell validation;
2. `docker compose config` validation of the production file;
3. Docker `runtime` target build;
4. Docker `migrate` target build.

Deployment to the VPS remains disabled until the GitHub variable `ENABLE_VPS_DEPLOY` is set to `true`.
