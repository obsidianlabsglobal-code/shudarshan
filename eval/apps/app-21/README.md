# Music Practice Log

A small Express + TypeScript REST API for logging music practice sessions. Each session has an instrument, date, duration, pieces practiced, and notes. Authentication uses JWT, and each user can only see and change their own sessions.

## Setup

    npm install
    npm run seed    # optional: resets data.json to the seed data
    npm start       # listens on PORT (default 3021)

Requires Node 20+. Data is stored in data.json in the working directory and is created automatically on first start. Set JWT_SECRET to keep tokens valid across restarts (otherwise a random secret is generated at startup).

Seeded users (also listed in sudarshan.json):

- alice@example.com / Alice-Scales-2024!
- bob@example.com / Bob-Arpeggios-2024!

## Session fields

- instrument: string (required)
- date: YYYY-MM-DD (required)
- durationMinutes: integer 1-1440 (required)
- pieces: array of strings (required)
- notes: string (optional)

## Example requests

Log in and copy the token from the response:

    curl -X POST http://localhost:3021/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@example.com","password":"Alice-Scales-2024!"}'

    export TOKEN=<paste token here>

List your sessions (each includes its id):

    curl http://localhost:3021/sessions -H "Authorization: Bearer $TOKEN"

Get one session by ID:

    curl http://localhost:3021/sessions/1 -H "Authorization: Bearer $TOKEN"

Create a session:

    curl -X POST http://localhost:3021/sessions -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"instrument":"Piano","date":"2024-05-10","durationMinutes":50,"pieces":["Debussy - Clair de Lune"],"notes":"Pedaling work"}'

Replace a session (PUT, all required fields):

    curl -X PUT http://localhost:3021/sessions/1 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"instrument":"Piano","date":"2024-05-06","durationMinutes":55,"pieces":["Chopin - Nocturne Op. 9 No. 2"],"notes":"Extended session"}'

Partially update a session (PATCH):

    curl -X PATCH http://localhost:3021/sessions/1 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"notes":"Left hand much better"}'

Delete a session:

    curl -X DELETE http://localhost:3021/sessions/1 -H "Authorization: Bearer $TOKEN"

Requesting another user's session returns 404.
