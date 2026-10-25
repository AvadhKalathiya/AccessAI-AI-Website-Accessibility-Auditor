# Contributing to AccessAI

Thank you for your interest in contributing to **AccessAI**! We welcome bug reports, feature proposals, and code contributions that improve web accessibility for all developers.

---

## Code of Conduct
We are committed to providing a friendly, safe, and welcoming environment. Please treat all contributors with respect, empathy, and professional courtesy.

---

## Development Setup

### 1. Prerequisites
- **Node.js:** v22.x LTS (tested on Node v22.19.0)
- **npm:** v10.x or higher
- **Git**
- *(Optional)* **Ollama:** If testing local AI remediation (e.g. `ollama pull deepseek-r1:8b`)

### 2. Getting Started
```bash
# Clone the repository
git clone https://github.com/your-username/accessai.git
cd accessai

# Install dependencies deterministically
npm ci

# Configure environment variables
cp .env.example .env

# Run database migrations
npm run db:migrate

# Start local development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verification & Quality Gates

All pull requests must pass the automated quality gates enforced by our CI pipeline:

```bash
# 1. Typecheck with TypeScript
npm run typecheck

# 2. Lint source files with ESLint
npm run lint

# 3. Run all unit, integration, and migration tests
npm run test

# 4. Run the End-to-End user journey test
npm run test:e2e

# 5. Verify production compilation
npm run build
```

---

## Coding Standards & Conventions

1. **Strict TypeScript:** Do not use `any` or disable type checking. All API routes, database models, and components must have strict types.
2. **Security First:** Any module accepting user-provided URLs or strings must enforce sanitization. Never bypass the SSRF or rate-limiting layers.
3. **Accessibility:** All UI components in `src/components/` must be fully keyboard accessible, support high-contrast modes, and adhere to WCAG 2.1 AA.
4. **Clean Commits:** Write concise, conventional commit messages (e.g. `feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
5. **Database Changes:** When modifying `src/lib/db/schema.ts`, generate migrations using `npm run db:generate` and commit the resulting migration files in `drizzle/`.

---

## Pull Request Guidelines

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Write unit or integration tests for new functionality in `tests/unit/` or `tests/integration/`.
3. Verify that all 184 tests pass without errors.
4. Submit your pull request targeting `main`. Ensure the description clearly explains the problem, proposed solution, and testing performed.
