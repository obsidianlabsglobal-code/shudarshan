# Appointment Notes API

Express + TypeScript API for appointment notes (date, person met, location, agenda, follow-up notes) with JWT login. Each user sees and manages only their own appointments.

## Setup

    npm install
    npm run seed    # (re)creates data.json with the seeded users and 4 appointments
    npm start       # listens on PORT, default 3024

Requires Node 20+. Data is stored in data.json (created automatically on first start). Set JWT_SECRET in any real deployment. Seeded credentials are in sudarshan.json (Alice has appointments 1-2, Bob has 3-4).

## Example requests

Log in and store the token:

    TOKEN=$(curl -s -X POST http://localhost:3024/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@example.com","password":"alice-Pass#2024"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

List (includes IDs):

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3024/appointments

Get one:

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3024/appointments/1

Create:

    curl -X POST http://localhost:3024/appointments -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"date":"2025-04-02T14:00:00Z","personMet":"Sam Lee","location":"Library cafe","agenda":"Book club planning","followUpNotes":"Pick next title"}'

Update (PUT replaces all fields; PATCH changes only the fields sent):

    curl -X PATCH http://localhost:3024/appointments/1 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"followUpNotes":"Roadmap sent; waiting on candidates."}'

Delete:

    curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3024/appointments/2

## Routes

- POST /auth/login - body: email, password; returns a token valid for 1 hour
- GET /appointments - list your appointments
- GET /appointments/:id - get one
- POST /appointments - create (date, personMet, location, agenda required; followUpNotes optional)
- PUT /appointments/:id - full update
- PATCH /appointments/:id - partial update
- DELETE /appointments/:id - delete (204)

Requesting another user's appointment returns 404.
