# Weekly Meal Planner API

A small Express + TypeScript REST API for planning meals. Each meal has a date, a meal slot, a dish name and a preparation note. Authentication uses JWT. Each user can only see and change their own meals.

Requires Node 20 or newer.

## Setup

    npm install
    npm run seed    # optional: resets data.json to the sample data
    npm start       # listens on PORT (default 3005)

If data.json does not exist, it is created with the seed data on first start.

Optional environment variables:

- PORT: port to listen on (default 3005)
- JWT_SECRET: secret used to sign tokens. If not set, a random one is generated on each start, so tokens stop working after a restart.

## Seeded users

See sudarshan.json for the email addresses and passwords of Alice and Bob. Each has two meals.

## Meal fields

- date: YYYY-MM-DD
- mealSlot: breakfast, lunch, dinner or snack
- dishName: 1 to 120 characters
- prepNote: optional text, up to 500 characters

## Routes

- POST /auth/login: get a token
- GET /meals: list your meals (with IDs). Optional query: from and to (YYYY-MM-DD)
- GET /meals/:id: view one meal
- POST /meals: create a meal
- PUT /meals/:id: replace a meal (date, mealSlot and dishName required)
- PATCH /meals/:id: edit some fields of a meal
- DELETE /meals/:id: delete a meal

All /meals routes require the header Authorization: Bearer TOKEN.

## Example requests

Log in as Alice and store the token:

    TOKEN=$(curl -s -X POST http://localhost:3005/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@example.com","password":"Alice-Pass-2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

List meals:

    curl http://localhost:3005/meals -H "Authorization: Bearer $TOKEN"

List meals for a date range:

    curl 'http://localhost:3005/meals?from=2025-01-06&to=2025-01-12' -H "Authorization: Bearer $TOKEN"

View one meal:

    curl http://localhost:3005/meals/1 -H "Authorization: Bearer $TOKEN"

Create a meal:

    curl -X POST http://localhost:3005/meals -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"date":"2025-01-09","mealSlot":"lunch","dishName":"Greek Salad","prepNote":"Chop vegetables in the morning."}'

Edit a meal:

    curl -X PATCH http://localhost:3005/meals/1 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"prepNote":"Roast for 50 minutes instead."}'

Delete a meal:

    curl -X DELETE http://localhost:3005/meals/1 -H "Authorization: Bearer $TOKEN"

Requesting a meal that belongs to another user returns 404.
