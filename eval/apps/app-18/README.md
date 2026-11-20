# Subscription Tracker

Small Express + TypeScript API for tracking subscriptions (provider, monthly cost, renewal date, account note). Uses JWT login. Each user can only see and change their own records.

## Setup

    npm install
    npm run seed    # resets data.json and rewrites sudarshan.json
    npm start       # listens on PORT (default 3018)

Optional: set JWT_SECRET to keep tokens valid across restarts. If it is not set, a random secret is generated on each run. The first start seeds automatically if data.json is missing.

Seeded users (also listed in sudarshan.json):

- alice@example.com / Alice-Tracker-91!
- bob@example.com / Bob-Tracker-47!

These are demo credentials only. Do not use them outside local development.

## Routes

- POST /auth/login
- GET /subscriptions (list, includes IDs)
- GET /subscriptions/:id
- POST /subscriptions
- PUT /subscriptions/:id (full update; provider, monthlyCost, renewalDate required)
- PATCH /subscriptions/:id (partial update)
- DELETE /subscriptions/:id

Renewal dates use YYYY-MM-DD. Requests for another user's record return 404.

## Example requests

Log in and keep the token:

    TOKEN=$(curl -s -X POST http://localhost:3018/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"email":"alice@example.com","password":"Alice-Tracker-91!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

List:

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3018/subscriptions

View one:

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3018/subscriptions/1

Create:

    curl -X POST http://localhost:3018/subscriptions \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"provider":"iCloud+","monthlyCost":2.99,"renewalDate":"2025-09-10","accountNote":"200GB plan"}'

Edit:

    curl -X PATCH http://localhost:3018/subscriptions/1 \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"monthlyCost":16.99}'

Delete:

    curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3018/subscriptions/1
