# Bill Tracker

Small Express + TypeScript API for tracking bills. Each bill has a provider, amount, due date, payment status (unpaid, paid, overdue) and reference number. Auth is JWT; each user only sees their own bills. Runs on Node 20.

## Run

    npm install
    npm run seed    # (re)creates data.json with Alice and Bob and their bills
    npm start       # listens on PORT, default 3022

If data.json does not exist, it is seeded automatically on first start. Set JWT_SECRET in the environment for anything beyond local use. Seeded credentials are in sudarshan.json.

## Routes

- POST /auth/login - body: email, password; returns a token
- GET /bills - list your bills (with IDs)
- GET /bills/:id - get one bill
- POST /bills - create (provider, amount, dueDate as YYYY-MM-DD, referenceNumber; paymentStatus optional, defaults to unpaid)
- PUT /bills/:id (or PATCH) - update any subset of fields
- DELETE /bills/:id - delete (204)

## Example requests

    TOKEN=$(curl -s -X POST http://localhost:3022/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"email":"alice@example.com","password":"alice-Pass#2025"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3022/bills

    curl -X POST http://localhost:3022/bills \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"provider":"City Gas","amount":42.5,"dueDate":"2025-08-01","referenceNumber":"CG-1001"}'

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3022/bills/<id>

    curl -X PUT http://localhost:3022/bills/<id> \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"paymentStatus":"paid"}'

    curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3022/bills/<id>
