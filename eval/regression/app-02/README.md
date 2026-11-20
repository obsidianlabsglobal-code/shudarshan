# Personal Expense Log

A small Express + TypeScript API for tracking personal expenses. Each expense has an amount, merchant, date (YYYY-MM-DD), category, and note. Authentication uses JWT, and each user can only see and change their own expenses.

## Setup

```
npm install
npm run seed   # optional: resets data.json with the two seeded users and their expenses
npm start      # listens on PORT, default 3002
```

If `data.json` does not exist, it is created and seeded automatically on first start. Set `JWT_SECRET` in the environment for anything other than local use. Requires Node 20+.

Seeded credentials are in `sudarshan.json` (Alice: alice@example.com, Bob: bob@example.com).

## Routes

- `POST /auth/login` - get a token
- `GET /expenses` - list your expenses (each includes its `id`)
- `GET /expenses/:id` - get one
- `POST /expenses` - create
- `PUT /expenses/:id` - replace all fields (note is optional)
- `PATCH /expenses/:id` - update some fields
- `DELETE /expenses/:id` - delete

## Example requests

Log in and store the token:

```
TOKEN=$(curl -s -X POST http://localhost:3002/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@example.com","password":"alice-Pass#2024"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
```

List expenses:

```
curl http://localhost:3002/expenses -H "Authorization: Bearer $TOKEN"
```

Get one:

```
curl http://localhost:3002/expenses/1 -H "Authorization: Bearer $TOKEN"
```

Create:

```
curl -X POST http://localhost:3002/expenses -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"amount":18.25,"merchant":"Corner Bakery","date":"2024-05-14","category":"Dining","note":"Breakfast"}'
```

Edit:

```
curl -X PATCH http://localhost:3002/expenses/1 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"amount":57.10,"note":"Corrected total"}'
```

Delete:

```
curl -X DELETE http://localhost:3002/expenses/1 -H "Authorization: Bearer $TOKEN"
```

Requests for another user's expense ID return 404. Invalid input returns 400, and a missing or invalid token returns 401.
