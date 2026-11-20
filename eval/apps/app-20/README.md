# Language Flashcards API

Small Express + TypeScript app (run with tsx, Node 20+). Each card has `term`, `translation`, `example`, and `reviewScore` (integer 0-5). Cards belong to the user who created them, and users can only see and change their own.

## Run

```
npm install
npm run seed   # optional: resets data.json with the two seeded users and their cards
npm start      # listens on PORT, default 3020
```

If `data.json` does not exist, it is created and seeded automatically on first start.

Environment variables: `PORT` (default 3020), `JWT_SECRET` (set this; if unset a random secret is used per process), `DATA_FILE` (default `data.json`).

Seeded logins are in `sudarshan.json` (Alice: alice@example.com, Bob: bob@example.org). Passwords are stored hashed in `data.json`.

## Example requests

Log in and keep the token:

```
TOKEN=$(curl -s -X POST http://localhost:3020/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@example.com","password":"Alice!Fl4sh-Card9"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
```

List your cards (IDs are included):

```
curl -H "Authorization: Bearer $TOKEN" http://localhost:3020/cards
```

Create a card:

```
curl -X POST http://localhost:3020/cards -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"term":"mariposa","translation":"butterfly","example":"Una mariposa se posó en la flor.","reviewScore":0}'
```

Get one card (replace `ID`):

```
curl -H "Authorization: Bearer $TOKEN" http://localhost:3020/cards/ID
```

Update a card (PUT or PATCH; send any of the fields):

```
curl -X PUT http://localhost:3020/cards/ID -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reviewScore":4}'
```

Delete a card:

```
curl -X DELETE http://localhost:3020/cards/ID -H "Authorization: Bearer $TOKEN"
```

## Routes

- `POST /auth/login` returns `{ token, user }` (token valid for 1 hour)
- `GET /cards` lists your cards
- `GET /cards/:id` gets one of your cards
- `POST /cards` creates a card (`term` and `translation` required)
- `PUT /cards/:id` and `PATCH /cards/:id` update a card
- `DELETE /cards/:id` deletes a card (204)
