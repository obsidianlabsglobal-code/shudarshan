# Client Notes API

A small Express + TypeScript API for freelancers to keep client records (company name, contact, project summary, rate, meeting notes). Each user only sees and edits their own records. Requires Node 20+.

## Setup

    npm install
    npm run seed    # optional: resets data.json and rewrites sudarshan.json with the two seeded users
    npm start       # listens on PORT (default 3014)

On first start, data is seeded automatically if data.json does not exist. Set JWT_SECRET to keep tokens valid across restarts; otherwise a random secret is generated per run.

Seeded logins are in sudarshan.json (Alice: alice@example.com, Bob: bob@example.org). Each has two sample clients.

## Routes

- POST /auth/login  (body: email, password; returns a token)
- GET /clients  (list, includes ids)
- GET /clients/:id
- POST /clients  (companyName, contact, rate required; projectSummary, meetingNotes optional)
- PUT /clients/:id  (full update)
- PATCH /clients/:id  (partial update)
- DELETE /clients/:id

All /clients routes need the header `Authorization: Bearer <token>`. Records belonging to other users return 404.

## Example requests

    TOKEN=$(curl -s -X POST http://localhost:3014/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"email":"alice@example.com","password":"alice-Pass#2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

    # list
    curl -H "Authorization: Bearer $TOKEN" http://localhost:3014/clients

    # view one (use an id from the list)
    curl -H "Authorization: Bearer $TOKEN" http://localhost:3014/clients/<id>

    # create
    curl -X POST http://localhost:3014/clients \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"companyName":"Acme","contact":"Jo <jo@acme.example>","projectSummary":"API work","rate":100,"meetingNotes":"Intro call"}'

    # edit (partial)
    curl -X PATCH http://localhost:3014/clients/<id> \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"rate":110,"meetingNotes":"Rate increased"}'

    # delete
    curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3014/clients/<id>
