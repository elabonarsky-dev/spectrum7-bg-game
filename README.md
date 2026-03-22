# Spectrum 7

A browser-based colour-matching reel game. Players select a sequence of 1–7 colours from the visible spectrum, then spin 7 reels. If the selected sequence matches the reel results from left to right, the player wins.

> **This is Milestone 1** — the foundation scaffold. Full server-side RNG, reel animation, credits and payments are planned for later milestones.

---

## Folder Structure

```
spectrum7/
  backend/
    src/
      server.js          Express entry point
      routes/
        health.js        GET /api/health
      services/           (Milestone 2+)
      utils/              (Milestone 2+)
    package.json
  frontend/
    index.html           Main game page
    css/
      styles.css         Core styles
      mobile.css         Responsive overrides
    js/
      app.js             Entry point — wires events, mock spin flow
      state.js           Central game state
      selection.js       Colour selection / undo / reset handlers
      reels.js           Validation logic + temporary mock spin
      ui.js              DOM rendering helpers
    storeroom/
      images/            (future assets)
      audio/             (future assets)
  README.md
```

---

## Running the Project

### Frontend

No build step required. Open `frontend/index.html` directly in a browser, or serve it with any static file server:

```bash
cd spectrum7/frontend
npx serve .
```

### Backend

```bash
cd spectrum7/backend
npm install
npm start          # production
npm run dev        # development with auto-reload (Node 18+)
```

The server starts on **http://localhost:3000** by default. Verify with:

```
GET http://localhost:3000/api/health
```

---

## Milestone 1 Scope

| Feature | Status |
|---|---|
| Colour selection (1–7, ordered) | Done |
| Undo last / reset selection | Done |
| 7-reel placeholder layout | Done |
| Left-to-right validation logic | Done |
| Mock spin with local random result | Done |
| Win / loss outcome display | Done |
| Backend Express scaffold + health route | Done |
| Mobile-responsive layout | Done |
| Server-side RNG | Milestone 2 |
| Reel animation | Milestone 2 |
| Credits / balance system | Milestone 2+ |
| Stripe integration | Future |
| Audio | Future |

---

## Tech Stack

- **Frontend:** HTML, CSS, vanilla JavaScript (no frameworks)
- **Backend:** Node.js + Express
