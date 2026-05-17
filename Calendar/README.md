# Calendar Online Clone

React + Node recreation of the public shared calendar route at `calendar.online/:shareId`.

## Stack

- `frontend/`: React + Vite
- `backend/`: Express proxy/scraper with fixture fallback

## Scripts

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run start`

## Notes

- The backend fetches live data from `https://api.calendar.online/` using the share id.
- If the live request fails for the scraped sample id `ec52dc9ed413134fcc88`, the backend falls back to local fixture data.
- The frontend accepts either a full `calendar.online` URL or just the share id.
