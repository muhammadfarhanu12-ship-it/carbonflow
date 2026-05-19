# CarbonFlow Frontend

## Run Locally

Prerequisites: Node.js 20+ and a running CarbonFlow backend.

1. Install dependencies: `npm install`
2. Set `VITE_API_URL` in `.env.local` or `.env`.
3. Run the app: `npm run dev`

Example:

```text
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

For production on Vercel, set `VITE_API_URL=https://carbonflow-h9cj.onrender.com/api`.

## Enterprise Carbon Workflows

- Dashboard uses `/api/dashboard/summary` for live Scope 1/2/3 totals, monthly trends, category breakdowns, facility/business-unit summaries, data quality, and report status.
- Ledger includes a connected emission activity form for Scope 1, Scope 2, and practical Scope 3 categories.
- Reports use authenticated API downloads so generated PDF/CSV files work with bearer-token sessions.

Warning: This MVP uses sample emission factors. Replace with official factors before production use.
