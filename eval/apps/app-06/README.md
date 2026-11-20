# Trip Planner API

Small Express + TypeScript API for saving trips (destination, dates, bookings, itinerary notes). Uses JWT login. Each user only sees and edits their own trips.

## Run

    npm install
    npm run seed    # (re)creates data.json with Alice and Bob and their trips
    npm start       # listens on PORT, default 3006

Requires Node 20+. Data is stored in `data.json` (created automatically on first start). Set `JWT_SECRET` in any real deployment. Seeded credentials are in `sudarshan.json`.

## Endpoints

- POST /auth/login : returns a JWT
- GET /trips : list your trips (each includes its id)
- GET /trips/:id : get one trip
- POST /trips : create a trip
- PUT /trips/:id : replace a trip (title, destination, startDate, endDate required)
- PATCH /trips/:id : update only the fields you send
- DELETE /trips/:id : delete a trip

Dates use YYYY-MM-DD. Booking types: flight, hotel, train, car, activity, other.

## Example requests

Log in as Alice and store the token:

    TOKEN=$(curl -s -X POST http://localhost:3006/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@example.com","password":"Alice-Pass-4821!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

List trips (copy an id from the response):

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3006/trips

Get one trip:

    curl -H "Authorization: Bearer $TOKEN" http://localhost:3006/trips/TRIP_ID

Create a trip:

    curl -X POST http://localhost:3006/trips -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":"Reykjavik Escape","destination":"Reykjavik, Iceland","startDate":"2026-01-10","endDate":"2026-01-15","bookings":[{"type":"flight","provider":"Icelandair","reference":"FI455"}],"itineraryNotes":["Blue Lagoon on arrival day"]}'

Update part of a trip:

    curl -X PATCH http://localhost:3006/trips/TRIP_ID -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"itineraryNotes":["Northern lights tour on night 2"]}'

Delete a trip:

    curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3006/trips/TRIP_ID
