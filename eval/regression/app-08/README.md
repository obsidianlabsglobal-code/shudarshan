# Job Application Tracker

Small Express + TypeScript API for tracking job applications. Each application has a company, role, stage, contactName and notes. Every user only sees and changes their own applications.

## Run

    npm install
    npm run seed    # optional: resets db.json with Alice and Bob (also happens automatically on first start)
    npm start       # listens on PORT, default 3008

Set JWT_SECRET in the environment for tokens that survive restarts. Seeded logins are in sudarshan.json.

Valid stages: wishlist, applied, phone_screen, interview, offer, rejected, withdrawn.

## Example requests

Log in (returns a token valid for 1 hour):

    curl -s -X POST http://localhost:3008/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@example.com","password":"Alice-Tracker-4721"}'

Use the token:

    TOKEN=<paste token here>

List (each item includes its id):

    curl -s http://localhost:3008/applications -H "Authorization: Bearer $TOKEN"

Create:

    curl -s -X POST http://localhost:3008/applications -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"company":"Globex","role":"SRE","stage":"applied","contactName":"Sam Lee","notes":"Found on careers page"}'

Get one:

    curl -s http://localhost:3008/applications/<id> -H "Authorization: Bearer $TOKEN"

Update (PUT replaces all fields, PATCH changes only the fields you send):

    curl -s -X PATCH http://localhost:3008/applications/<id> -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"stage":"interview"}'

Delete (returns 204):

    curl -s -X DELETE http://localhost:3008/applications/<id> -H "Authorization: Bearer $TOKEN"

## Notes

- Data is stored in db.json next to server.ts. Passwords are stored as salted scrypt hashes.
- Requesting another user's application id returns 404.
- Repeated failed logins from one IP are temporarily blocked (10 attempts per 15 minutes).
