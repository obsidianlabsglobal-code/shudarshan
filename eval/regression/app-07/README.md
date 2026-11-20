# Study Notes API

Express + TypeScript API for study notes. Each note has an `id`, `course`, `topic`, `body`, and `lastEdited` date. Login uses JWT, and every user only sees and changes their own notes.

## Setup

```
npm install
npm run seed    # (re)creates data.json with Alice and Bob and two notes each
npm start       # listens on PORT, default 3007
```

If `data.json` does not exist, `npm start` seeds it automatically. Set `JWT_SECRET` to keep tokens valid across restarts. Without it, a random secret is generated each run. Seeded credentials are in `sudarshan.json`.

## Routes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | /auth/login | no | Returns `{ token }` |
| GET | /notes | yes | List your notes (includes IDs) |
| GET | /notes/:id | yes | Get one note |
| POST | /notes | yes | Create (course, topic, body required) |
| PUT | /notes/:id | yes | Replace (all three fields required) |
| PATCH | /notes/:id | yes | Partial update |
| DELETE | /notes/:id | yes | Delete (returns 204) |

## Example requests

```
# Log in as Alice and keep the token
TOKEN=$(curl -s -X POST http://localhost:3007/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"alice-Study#2024"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

# List notes
curl -H "Authorization: Bearer $TOKEN" http://localhost:3007/notes

# Create a note
curl -X POST http://localhost:3007/notes \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"course":"Chemistry","topic":"Le Chatelier principle","body":"Equilibrium shifts to oppose a change in conditions."}'

# Get one note (replace NOTE_ID with an id from the list)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3007/notes/NOTE_ID

# Update part of a note
curl -X PATCH http://localhost:3007/notes/NOTE_ID \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"body":"Updated body text"}'

# Delete a note
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3007/notes/NOTE_ID
```

Tokens expire after one hour. Requesting another user's note returns 404.
