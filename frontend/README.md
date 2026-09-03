# Study OS frontend

The React and TypeScript client. Four pages: Bank, Study, Dashboard and Eval. Vite
serves it and proxies `/api` to the backend on port 8080, so I have to have the backend
and Postgres running before anything loads.

    npm install
    npm run dev     # dev server on http://localhost:5173
    npm test        # Vitest, no backend and no API key needed
    npm run build   # type check, then the production bundle

The README at the repository root covers what Study OS does and how to start the
backend and the database.
