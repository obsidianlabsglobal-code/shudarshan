# Workout Log

A small Express + TypeScript API for logging workouts (exercises, sets, reps, comments). Uses JWT login. Each user can only see and change their own workouts.

## Setup

    npm install
    npm run seed    # optional: resets data.json with Alice and Bob
    npm start       # listens on PORT (default 3009)

Data is stored in data.json next to server.ts and is created automatically on first start. Set JWT_SECRET in the environment for anything beyond local use (it is required when NODE_ENV=production). Credentials for the seeded users are in sudarshan.json. Requires Node 20+. tsx runs the TypeScript directly without type-checking.

## Routes

- POST /auth/login - get a token
- GET /workouts - list your workouts (each includes its id)
- GET /workouts/:id - view one
- POST /workouts - create
- PUT /workouts/:id - replace (full update)
- PATCH /workouts/:id - partial update
- DELETE /workouts/:id - delete

All /workouts routes need the header Authorization: Bearer TOKEN.

## Example requests

Log in as Alice and store the token:

    TOKEN=$(curl -s -X POST http://localhost:3009/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"email":"alice@example.com","password":"Alice-Lifts-2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

List workouts:

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3009/workouts

Get one:

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3009/workouts/1

Create:

    curl -X POST http://localhost:3009/workouts \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"title":"Pull day","date":"2024-05-10","exercises":[{"name":"Rows","sets":4,"reps":10}],"comments":"Good pump"}'

Edit (partial):

    curl -X PATCH http://localhost:3009/workouts/1 \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"comments":"Updated note"}'

Delete:

    curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3009/workouts/1

A workout has the shape: id, title, date (YYYY-MM-DD), exercises (list of name, sets, reps), comments.
