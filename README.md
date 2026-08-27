# PFIS (Predictive Fraud Intelligence System)

This workspace has been upgraded from a single static HTML file to a small Express-based web application with multiple pages, navigation and a simple backend API.

## Project structure

```
PFIS/                     # project root
  package.json            # Node dependencies and scripts
  server.js               # Express server entrypoint
  public/                 # static assets served directly
    css/style.css         # shared stylesheet
    js/app.js             # client-side script (simulation logic, can be extended)
  views/                  # EJS templates for each page
    partials/
      header.ejs          # header + navigation + opening HTML tags
      footer.ejs          # footer + closing HTML tags + script include
    dashboard.ejs         # dashboard page
    monitor.ejs
    transactions.ejs
    profiles.ejs
    investigations.ejs
    reports.ejs
    settings.ejs
    about.ejs
  PFIS.html               # legacy single-page snapshot (not used by server)
  README.md               # this file
```

## Getting started

1. Install Node.js (v16+).
2. From the project root run:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
   or during development:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Navigating the new pages

- **Dashboard** – top‑level summary with real‑time statistics, risk distribution bars, recent high‑risk transactions, trend chart, user‑type breakdown, and an activity log. Data refreshes automatically while the engine is running.
- **Live Monitor** – live feed of recent transactions with filtering controls and counts.
- **Transactions** – history listing, fetches from `/api/transactions` and supports risk/status filters as well as CSV export.
- **User Profiles**, **Investigations**, **Reports**, **Settings**, **About PFIS** – fully fleshed out versions of the original UI. Reports and Settings pages dynamically pull data from extended APIs; Settings includes a tabbed menu.
- **Pilot Brief** – buyer-facing summary of live impact metrics, integration readiness and a recommended 30-day operator pilot. It can be printed or saved as a PDF from the browser.

The login page includes a guided demo button that signs into the seeded administrator account for product walkthroughs.

All pages share the same header and footer partials and the global stylesheet.

## Backend API

The server uses a persistent local JSON datastore in `data/pfis-store.json` for transactions, investigations, threat reports and settings. Demo mode generates Ghana telecom events on startup; a production deployment should replace the demo generator with signed operator webhooks or a managed database.

The following endpoints are available:

- `GET /api/transactions` – returns an array of all transactions (newest first)
- `GET /api/profiles` – returns the list of defined profiles
- `GET /api/investigations` – returns open and closed investigation cases
- `POST /api/investigations` – create a new case by sending JSON body with `txnId`, `account`, `amount`, `reason`, `priority` (returns 201)
- `POST /api/engine` – control engine; send `{"action":"start"}` or `{"action":"stop"}`

These can be replaced by database-backed logic or secured with authentication as your project grows.


PFIS is positioned as a telecom operator fraud operations product for MTN, AirtelTigo and Telecel. Banking and government-agency claims are intentionally excluded from the served product.
