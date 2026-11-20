# Daily Journal API

A small Express + TypeScript API for dated journal entries (title, body, mood) with JWT login. Each user only sees and changes their own entries.

## Setup

```
npm install
npm run seed    # (re)creates data.json with the two demo users and their entries
npm start       # listens on PORT, default 3003
```

Requires Node 20+. Data is stored in `data.json` next to `server.ts` (created automatically on first start). Set `JWT_SECRET` to keep tokens valid across restarts; otherwise a random secret is generated at startup. Tokens expire after 1 hour.

Demo credentials are in `sudarshan.json` (Alice: alice@example.com, Bob: bob@example.com).

## Entry fields

- `title`: string, 1-120 characters
- `body`: string, 1-10000 characters
- `mood`: one of `great`, `good`, `okay`, `low`, `awful`
- `date`: `YYYY-MM-DD` (optional on create, defaults to today)

Responses also include `id`, `createdAt` and `updatedAt`.

## Routes

| Method | Path | Description |
| --- | --- | --- |
| POST | /auth/login | Get a JWT |
| GET | /entries | List your entries (with IDs) |
| GET | /entries/:id | Get one entry |
| POST | /entries | Create an entry |
| PUT | /entries/:id | Replace title, body and mood (date optional) |
| PATCH | /entries/:id | Update any subset of fields |
| DELETE | /entries/:id | Delete an entry |

## Example requests

Log in and store the token:

```
TOKEN=$(curl -s -X POST http://localhost:3003/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Alice-Pass-2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
```

List entries:

```
curl -H "Authorization: Bearer $TOKEN" http://localhost:3003/entries
```

Create an entry:

```
curl -X POST http://localhost:3003/entries \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"date":"2024-05-04","title":"Picnic","body":"Sunny afternoon in the park.","mood":"great"}'
```

View one entry (replace ENTRY_ID with an id from the list):

```
curl -H "Authorization: Bearer $TOKEN" http://localhost:3003/entries/ENTRY_ID
```

Revise an entry:

```
curl -X PATCH http://localhost:3003/entries/ENTRY_ID \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mood":"good"}'
```

Delete an entry:

```
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3003/entries/ENTRY_ID
```

## Notes

- Requesting another user's entry returns 404.
- `tsx` runs the TypeScript directly without type-checking, so no `@types` packages are needed.
