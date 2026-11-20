# Contact Book API

A small Express + TypeScript REST API where each user saves contacts (name, phone, email, notes). Authentication uses JWT. Each user can only see and change their own contacts.

## Setup

    npm install
    npm run seed    # optional: resets data.json and rewrites sudarshan.json
    npm start       # listens on PORT, default 3016

The first `npm start` seeds automatically if `data.json` does not exist. Data is stored in `data.json` next to `server.ts`. Requires Node 20+. Types are not checked at runtime (tsx only transpiles).

Environment variables:

- `PORT` (default 3016)
- `JWT_SECRET` (set this to a long random string outside of local development)

## Seeded users

See `sudarshan.json`:

- alice@example.com / AlicePass#2024 (2 contacts: dentist, plumber)
- bob@example.com / BobPass#2024 (2 contacts: project lead, mechanic)

## Example requests

Log in and keep the token:

    TOKEN=$(curl -s -X POST http://localhost:3016/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"email":"alice@example.com","password":"AlicePass#2024"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

List contacts (IDs included):

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3016/contacts

Get one by ID:

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3016/contacts/1

Create:

    curl -X POST http://localhost:3016/contacts \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"name":"Sam Green","phone":"+1-555-0103","email":"sam@example.com","notes":"Met at the conference"}'

Update (PUT replaces all fields, name required; PATCH changes only the fields sent):

    curl -X PUT http://localhost:3016/contacts/1 \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"name":"Dr. Maria Lopez","phone":"+1-555-0199","email":"maria.lopez@smileclinic.example","notes":"New number"}'

    curl -X PATCH http://localhost:3016/contacts/1 \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"notes":"Appointment moved to April"}'

Delete (returns 204):

    curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3016/contacts/1

## Routes

- POST /auth/login
- GET /contacts
- GET /contacts/:id
- POST /contacts
- PUT /contacts/:id
- PATCH /contacts/:id
- DELETE /contacts/:id
- GET /health

Requesting another user's contact ID returns 404.
