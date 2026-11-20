# Home Inventory API

Express + TypeScript REST API for tracking household items (name, room, purchase date, price, serial number). Uses JWT login. Each user can only see and change their own items.

## Setup

    npm install
    npm run seed    # (re)creates data.json and sudarshan.json with the two demo users and their items
    npm start       # listens on PORT, default 3015

If data.json does not exist, `npm start` seeds it automatically. Set JWT_SECRET to keep tokens valid across restarts; otherwise a random secret is generated on each start. Requires Node 20+.

Seeded users (also listed in sudarshan.json):

- Alice: alice@example.com / Alice-Pass-2024!
- Bob: bob@example.com / Bob-Pass-2024!

## Routes

- POST /auth/login - returns a JWT (valid 1 hour)
- GET /items - list your items (each includes its id)
- GET /items/:id - get one item
- POST /items - create an item
- PUT /items/:id - replace all fields of an item
- PATCH /items/:id - update some fields of an item
- DELETE /items/:id - delete an item (204)

Item fields: name (string), room (string), purchaseDate (YYYY-MM-DD), price (number >= 0), serialNumber (string).

## Example requests

Log in and copy the token from the response:

    curl -X POST http://localhost:3015/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"email":"alice@example.com","password":"Alice-Pass-2024!"}'

    export TOKEN=<paste token here>

List items:

    curl http://localhost:3015/items -H "Authorization: Bearer $TOKEN"

Get one item:

    curl http://localhost:3015/items/<id> -H "Authorization: Bearer $TOKEN"

Create an item:

    curl -X POST http://localhost:3015/items \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"name":"Dyson Vacuum","room":"Hallway","purchaseDate":"2024-02-10","price":449.99,"serialNumber":"DYS-V15-330045"}'

Update an item (partial):

    curl -X PATCH http://localhost:3015/items/<id> \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"room":"Utility Closet"}'

Delete an item:

    curl -X DELETE http://localhost:3015/items/<id> -H "Authorization: Bearer $TOKEN"
