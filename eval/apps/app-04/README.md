# Habit Tracker API

Small Express + TypeScript API where users create habits and record daily check-ins. Auth is JWT (Bearer token). Each user only sees and modifies their own habits.

## Run

    npm install
    npm run seed    # (re)creates data.json with two users and four habits
    npm start       # listens on PORT, default 3004

Requires Node 20+. Data is stored in `data.json` next to `server.ts` (created automatically on first start if missing). Optional env vars: `PORT`, `JWT_SECRET` (random per start if unset), `DATA_FILE`.

## Seeded users

Credentials are also in `sudarshan.json`.

- Alice: alice@example.com / alice-Pass#2024 (habits: Morning run, Read 20 pages)
- Bob: bob@example.com / bob-Pass#2024 (habits: Drink 2L of water, Practice guitar)

## Example requests

Log in and store the token:

    TOKEN=$(curl -s -X POST http://localhost:3004/login \
      -H 'Content-Type: application/json' \
      -d '{"email":"alice@example.com","password":"alice-Pass#2024"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

List habits (includes ids):

    curl http://localhost:3004/habits -H "Authorization: Bearer $TOKEN"

Get one habit:

    curl http://localhost:3004/habits/1 -H "Authorization: Bearer $TOKEN"

Create a habit:

    curl -X POST http://localhost:3004/habits \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"name":"Meditate","description":"10 minutes","targetPerWeek":5}'

Update check-ins (replaces the list; other fields are optional):

    curl -X PUT http://localhost:3004/habits/1 \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"checkIns":["2025-01-01","2025-01-02"]}'

Record a single check-in (date defaults to today):

    curl -X POST http://localhost:3004/habits/1/check-ins \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"date":"2025-01-03"}'

Delete a habit:

    curl -X DELETE http://localhost:3004/habits/1 -H "Authorization: Bearer $TOKEN"

## Routes

- POST /login
- GET /habits
- POST /habits
- GET /habits/:id
- PUT /habits/:id (PATCH also works)
- POST /habits/:id/check-ins
- DELETE /habits/:id
