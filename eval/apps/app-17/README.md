# Personal Task Board

A small Express + TypeScript API. Each task has a title, description, due date, and status (todo, in_progress, done). Users log in with JWT and only see their own tasks.

## Setup

    npm install
    npm run seed     # optional: resets data.json to the two seeded users and their tasks
    npm start        # listens on PORT, default 3017

The first start seeds data automatically if data.json does not exist. Set JWT_SECRET to keep tokens valid across restarts; otherwise a random secret is generated at startup. Requires Node 20+. tsx runs the TypeScript directly and does not type-check.

Seeded logins (also in sudarshan.json):

- alice@example.com / Alice-Pass-2024!
- bob@example.com / Bob-Pass-2024!

## Routes

- POST /auth/login - body: email, password; returns a token
- GET /tasks - list your tasks (each includes its id)
- GET /tasks/:id - get one task
- POST /tasks - create (title required; description, dueDate as YYYY-MM-DD or null, status optional)
- PUT /tasks/:id (or PATCH) - update any subset of fields
- DELETE /tasks/:id - delete (returns 204)

All /tasks routes need the header Authorization: Bearer TOKEN. Requests for another user's task return 404.

## Example requests

Log in and store the token:

    TOKEN=$(curl -s -X POST http://localhost:3017/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"email":"alice@example.com","password":"Alice-Pass-2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

List tasks:

    curl -s http://localhost:3017/tasks -H "Authorization: Bearer $TOKEN"

Create a task:

    curl -s -X POST http://localhost:3017/tasks \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"title":"Water the plants","description":"Balcony and kitchen","dueDate":"2025-04-01"}'

Get, update, and delete (replace ID with an id from the list response):

    curl -s http://localhost:3017/tasks/ID -H "Authorization: Bearer $TOKEN"

    curl -s -X PUT http://localhost:3017/tasks/ID \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"status":"done"}'

    curl -s -X DELETE http://localhost:3017/tasks/ID -H "Authorization: Bearer $TOKEN"
