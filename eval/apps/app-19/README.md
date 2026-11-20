# Garden Log

A small Express + TypeScript API for tracking plants. Each plant has a name, location, watering dates, and growing notes. Users log in with JWT and only see their own plants.

## Setup

Requires Node 20+.

```
npm install
npm run seed   # optional: resets data.json to the seeded users and plants
npm start      # listens on PORT, default 3019
```

If `data.json` does not exist, it is created with the seed data on first start. Set `JWT_SECRET` to keep tokens valid across restarts; otherwise a random secret is generated each time the server starts.

Seeded credentials are in `sudarshan.json`:

- Alice: alice@example.com / Alice-Garden-2024!
- Bob: bob@example.com / Bob-Compost-2024!

## Routes

| Method | Path | Description |
| --- | --- | --- |
| POST | /auth/login | Get a JWT |
| GET | /plants | List your plants (includes IDs) |
| GET | /plants/:id | View one plant |
| POST | /plants | Create a plant |
| PUT | /plants/:id | Update a plant (name and location required) |
| PATCH | /plants/:id | Partially update a plant |
| DELETE | /plants/:id | Delete a plant |

Plant fields: `name` (string), `location` (string), `wateringDates` (array of YYYY-MM-DD strings), `notes` (string).

## Example requests

Log in and keep the token:

```
TOKEN=$(curl -s -X POST http://localhost:3019/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Alice-Garden-2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
```

List plants:

```
curl -H "Authorization: Bearer $TOKEN" http://localhost:3019/plants
```

View one plant:

```
curl -H "Authorization: Bearer $TOKEN" http://localhost:3019/plants/1
```

Create a plant:

```
curl -X POST http://localhost:3019/plants \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Mint","location":"Back porch","wateringDates":["2024-06-10"],"notes":"Keep in a pot; it spreads."}'
```

Update a plant:

```
curl -X PUT http://localhost:3019/plants/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sungold Tomato","location":"Raised bed A","wateringDates":["2024-06-01","2024-06-04","2024-06-08","2024-06-11"],"notes":"Harvesting began."}'
```

Add only a note with PATCH:

```
curl -X PATCH http://localhost:3019/plants/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"notes":"Remove lower leaves."}'
```

Delete a plant:

```
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3019/plants/1
```

A plant that belongs to another user returns 404.
