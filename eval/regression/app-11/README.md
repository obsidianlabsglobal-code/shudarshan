# Savings Goals API

Express + TypeScript API for savings goals (name, target amount, current amount, deadline). Uses JWT login. Each user only sees and edits their own goals. Data is stored in `data.json`.

## Setup

```
npm install
npm run seed    # (re)creates data.json and sudarshan.json with Alice and Bob
npm start       # listens on PORT, default 3011
```

If `data.json` does not exist, `npm start` seeds it automatically. Set `JWT_SECRET` in any real deployment (a dev-only default is used otherwise). Optional: `DATA_FILE` changes where data is stored. Seeded credentials are in `sudarshan.json`:

- alice@example.com / AliceSaves#2024
- bob@example.com / BobSaves#2024

Note: tsx runs the TypeScript without type-checking.

## Example requests

Login (returns a token):

```
curl -X POST http://localhost:3011/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@example.com","password":"AliceSaves#2024"}'
```

Use the token in the commands below (replace `<token>` and `<id>`):

```
# list (each item includes its id)
curl http://localhost:3011/goals -H 'Authorization: Bearer <token>'

# get one
curl http://localhost:3011/goals/<id> -H 'Authorization: Bearer <token>'

# create
curl -X POST http://localhost:3011/goals -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"name":"New Bike","targetAmount":900,"currentAmount":100,"deadline":"2026-08-01"}'

# update (PUT or PATCH, send any of the fields)
curl -X PUT http://localhost:3011/goals/<id> -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"currentAmount":450}'

# delete
curl -X DELETE http://localhost:3011/goals/<id> -H 'Authorization: Bearer <token>'
```

## Routes

- POST /auth/login
- GET /goals
- GET /goals/:id
- POST /goals
- PUT /goals/:id (PATCH also works)
- DELETE /goals/:id

Deadlines use YYYY-MM-DD. Requesting another user's goal returns 404.
