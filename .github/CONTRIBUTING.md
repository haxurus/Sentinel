# Contributing to Sentinel

Thanks for your interest in Sentinel. Bug reports, ideas and pull requests are all welcome. This page explains how to take part so that your time is well spent.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Where things go

| You want to… | Go to |
|---|---|
| Report a bug | [New issue → Bug report](https://github.com/haxurus/Sentinel/issues/new/choose) |
| Propose a feature | [New issue → Feature request](https://github.com/haxurus/Sentinel/issues/new/choose) |
| Report a security vulnerability | [Private vulnerability reporting](https://github.com/haxurus/Sentinel/security/advisories/new) — never a public issue |
| Ask a question or get help | [Discord server](https://discord.gg/DDBGWP5fMX) — see [SUPPORT.md](SUPPORT.md) |
| Run your own instance | [docs/DISTRIBUTION.md](../docs/DISTRIBUTION.md) and [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) |

## Reporting bugs

- Search the existing issues first; if you find yours, add a 👍 or new details instead of opening a duplicate.
- Use the **Bug report** form and fill in every required field: steps to reproduce make the difference between a fix and a guess.
- Say whether it happens on the hosted instance or on a self-hosted one, and for self-hosted instances include the commit or image digest.
- Include the logger key (e.g. `message.delete`) and the delivery state shown in Dashboard → History when the problem is about logs.
- **Never** include tokens, passwords, `.env` files, database dumps or other people's messages. Redact logs before pasting them.

Issues are labelled `triage` until they are reviewed. An issue may be closed if it cannot be reproduced and no further information arrives within 30 days.

## Proposing features

- Start from the problem you want to solve and who has it; the solution can be discussed.
- Check the [project scope](#project-scope) below.
- Larger features are discussed in the issue before anyone writes code. A proposal being accepted means it fits the project, not that it has a delivery date.
- A feature may be offered on the Free plan or on a paid plan of the hosted instance; the code is open source either way.

## Project scope

Sentinel is a **read-only audit and logging bot**. To keep it safe and trustworthy, these are out of scope by design:

- **Moderation actions** (ban, kick, timeout, deleting messages, changing roles or channels): the bot's capability policy blocks them on purpose.
- **Tracking people**: online status, activities, games, music or anything Discord's privileged Presence intent would provide.
- Collecting data that is not needed to review moderation and server activity, or keeping it longer than the configured retention.
- Anything that breaks Discord's Terms of Service, Developer Policy or Monetization Terms.

### Paid plans

Paid plans are sold as Discord subscriptions, and Discord's [Monetization Terms](https://support.discord.com/hc/articles/5330075836311-Monetization-Terms) require that buyers get exactly what was described. So:

- A change that **reduces** a paid plan (lower limit, logger moved to a higher plan or removed, feature taken away) must say so in the pull request. It is released only after subscribers have been told in advance and given time to cancel; the maintainer handles the notice.
- Plan names, prices and benefits must stay consistent across `packages/shared/src/plans.ts`, the pricing page and the Discord SKUs.
- Never add a way to pay outside Discord, discounts or price differences.

## Pull requests

1. For anything bigger than a small fix, open or comment on an issue first so we agree on the approach.
2. Fork the repository and create a branch from `main` (e.g. `fix/missing-ban-reason`).
3. Set up the project as described in the [README](../README.md#local-development).
4. Make your change, keeping it focused: one pull request, one purpose.
5. Run `npm run build` and `npm test` locally.
6. Open the pull request and fill in the template.

`main` is protected: every change goes through a pull request and both CI checks (*Typecheck, tests and migrations* and *Compose and container images*) must pass. Workflows from first-time contributors start after a maintainer's approval.

### Guidelines

- **TypeScript, strict mode.** Follow the style of the surrounding code; comments explain *why*, not *what*.
- **Tests** for logic that can be tested without Discord (diffs, formatting, plans, permissions).
- **Both languages.** Every text shown to users exists in English and Italian.
- **Database migrations** must be backward-compatible with the previous release (expand/contract), so that rollback stays safe. Never edit an existing migration.
- **No secrets** in code, tests, fixtures or screenshots.
- **Dependencies** only when really needed, pinned to exact versions.
- **Commit messages** follow the [Conventional Commits](https://www.conventionalcommits.org) style used in the history: `feat:`, `fix:`, `docs:`, `chore:`, optionally with a scope such as `fix(bot):`.

Changes to `apps/bot/src/capability-policy*.ts`, `deploy/`, `ops/`, `security/`, `.github/workflows/` and `packages/db/prisma/migrations/` affect security or production directly and get a closer review.

## Licence of contributions

Sentinel is licensed under the [GNU AGPL-3.0-only](../LICENSE). By submitting a contribution you agree that it is licensed under the same terms and that you have the right to submit it.
