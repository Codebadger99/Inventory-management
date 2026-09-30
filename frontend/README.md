# Inventory frontend

A dependency-free HTML/CSS/JavaScript inventory dashboard for the NestJS API.

## Run locally

1. Start the backend from the `backend` folder with `npm run start:dev` (API defaults to `http://localhost:3000`). CORS is enabled in `backend/src/main.ts` for the standalone frontend.
2. Serve this folder from a local web server, for example with the VS Code Live Server extension, and open its `index.html` URL. Avoid opening the page as a `file://` URL because browser security may block API requests.

On startup, the page checks the inventory API, the Google Fonts CDN, and the local CSS/JavaScript assets before revealing the interface. If the API is unavailable, it opens the cached inventory and keeps offline changes queued for later sync; if the font CDN is unavailable, it falls back to system fonts.

## Render static-site settings

- **Root Directory:** `frontend`
- **Build Command:** `node build-config.js`
- **Publish Directory:** `.`
- Add the Render environment variable `INVENTORY_API_URL` with your backend service URL. The build writes it to the ignored `runtime-config.js`, which the page loads before `app.js`.

For local builds, `build-config.js` reads `INVENTORY_API_URL` from the shell or the ignored `frontend/.env`; it defaults to the deployed API URL above. The browser still uses the Render URL as a fallback if the generated config is absent.

The frontend calls `GET /`, `POST /`, `PATCH /:id`, and `DELETE /:id` on the API origin. By default, the origin is `http://localhost:3000`. To override it, set `window.INVENTORY_API_URL` before `app.js` loads, or in the browser console run `localStorage.setItem('inventoryApiUrl', 'http://localhost:3000')` and reload.

The form uses the API fields `name`, `size`, `colour`, and `description`. Inventory is read from the API when online and cached in browser local storage. Create, edit, and delete actions made offline are saved locally in a pending queue and automatically sent to the API when the connection returns. The database remains the source of truth; keep this browser profile's site data until pending changes have synced.
