# Personal Event Planner

A small Express + TypeScript API for managing personal events (title, date, location, guest list, notes). Auth uses JWT. Each user can only see and change their own events.

## Setup

    npm install
    npm run seed    # (re)creates data.json with users Alice and Bob and two events each
    npm start       # listens on PORT, default 3013

Data is stored in `data.json` (created automatically on first start if missing). Running `npm run seed` resets it.

Optional environment variables: `PORT` (default 3013), `JWT_SECRET` (a random one is generated at startup if unset, so tokens expire on restart), `DATA_FILE`.

Seeded credentials are listed in `sudarshan.json`.

## Example requests

Log in and copy the token from the response:

    curl -X POST http://localhost:3013/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"email":"alice@example.com","password":"alice-Pass-4821!"}'

    export TOKEN=<paste token here>

List events (each includes its id):

    curl http://localhost:3013/events -H "Authorization: Bearer $TOKEN"

Get one event:

    curl http://localhost:3013/events/<id> -H "Authorization: Bearer $TOKEN"

Create an event:

    curl -X POST http://localhost:3013/events \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"title":"Movie Night","date":"2025-11-01T20:00:00Z","location":"My place","guests":["Sam","Jo"],"notes":"Popcorn"}'

Update an event (PUT replaces all fields, PATCH changes only the fields you send):

    curl -X PATCH http://localhost:3013/events/<id> \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"location":"Community Hall"}'

Delete an event:

    curl -X DELETE http://localhost:3013/events/<id> -H "Authorization: Bearer $TOKEN"

## Routes

- POST /auth/login
- GET /events
- GET /events/:id
- POST /events
- PUT /events/:id
- PATCH /events/:id
- DELETE /events/:id
- GET /health
