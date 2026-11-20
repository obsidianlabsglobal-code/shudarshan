# Reading List API

A small Express + TypeScript app where each user keeps their own reading list. Each book has a title, writer, notes, and reading status (`want-to-read`, `reading`, or `finished`). Auth uses JWT.

Runs on Node 20+. Dependencies: express, jsonwebtoken, tsx.

## Setup

    npm install
    npm run seed    # (re)creates data.json with the two seeded users and their books
    npm start       # listens on PORT, default 3001

If `data.json` is missing, the server seeds it automatically on first start. Seeded credentials are in `sudarshan.json`:

- Alice: alice@example.com / Alice-Reads-2024!
- Bob: bob@example.org / Bob-Pages-2024!

Environment variables:

- `PORT` (default 3001)
- `JWT_SECRET` (recommended; if unset a random secret is generated per run, so tokens expire on restart)

## Routes

| Method | Path | Description |
| --- | --- | --- |
| POST | /auth/login | Get a JWT (valid 1 hour) |
| GET | /books | List your books (with IDs) |
| POST | /books | Create a book |
| GET | /books/:id | Get one book |
| PUT or PATCH | /books/:id | Update a book (send any of the fields) |
| DELETE | /books/:id | Delete a book |

You can only see and change your own books; other users' IDs return 404.

## Example requests

Log in and keep the token:

    TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"email":"alice@example.com","password":"Alice-Reads-2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

List:

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/books

Create:

    curl -X POST http://localhost:3001/books \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"title":"Piranesi","writer":"Susanna Clarke","notes":"Loved the mood","status":"want-to-read"}'

Get one:

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/books/1

Update:

    curl -X PUT http://localhost:3001/books/1 \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"status":"finished","notes":"Great ending"}'

Delete:

    curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3001/books/1
