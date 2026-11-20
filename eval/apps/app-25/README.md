# Gift Planner

A small Express + TypeScript API for tracking gift ideas. Each idea has a recipient, occasion, budget, store, and notes. Auth is JWT-based, and every user only sees their own ideas.

## Setup

```
npm install
npm run seed   # optional: resets data.json with the two seeded users and their gifts
npm start      # listens on PORT, default 3025
```

Requires Node 20+. Data is stored in `data.json` (created automatically on first start). Set `JWT_SECRET` to keep tokens valid across restarts; otherwise a random secret is generated each run.

## Seeded users

See `sudarshan.json`:

- alice@example.com / AlicePass123!
- bob@example.com / BobPass456!

Each has two gift ideas of their own.

## Example requests

Log in and keep the token:

```
curl -s -X POST http://localhost:3025/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@example.com","password":"AlicePass123!"}'

TOKEN=<paste token here>
```

List gift ideas (IDs included):

```
curl -s http://localhost:3025/gifts -H "Authorization: Bearer $TOKEN"
```

Get one:

```
curl -s http://localhost:3025/gifts/<id> -H "Authorization: Bearer $TOKEN"
```

Create:

```
curl -s -X POST http://localhost:3025/gifts -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"recipient":"Grandpa","occasion":"Holiday","budget":50,"store":"Amazon","notes":"Warm slippers, size 10"}'
```

Update (PUT or PATCH, any subset of fields):

```
curl -s -X PUT http://localhost:3025/gifts/<id> -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"budget":65,"notes":"Raised budget"}'
```

Delete:

```
curl -s -X DELETE http://localhost:3025/gifts/<id> -H "Authorization: Bearer $TOKEN"
```

## Routes

- `POST /auth/login` - returns `{ token }` (valid 1 hour)
- `GET /gifts` - list your gift ideas
- `GET /gifts/:id` - get one
- `POST /gifts` - create (`recipient`, `occasion`, `budget` required; `store`, `notes` optional)
- `PUT /gifts/:id` or `PATCH /gifts/:id` - update
- `DELETE /gifts/:id` - delete
- `GET /health` - health check
