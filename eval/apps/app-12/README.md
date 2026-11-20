# Recipe Box

A small Express + TypeScript API for home cooks. Each recipe has a name, ingredients, steps, and personal notes. Users log in with JWT and only see their own recipes.

## Setup

Requires Node 20+.

```
npm install
npm run seed    # (re)creates data.json with the two sample users and four recipes
npm start       # listens on PORT, default 3012
```

If `data.json` does not exist, `npm start` seeds it automatically. Set `JWT_SECRET` to keep tokens valid across restarts (otherwise a random secret is generated on each start).

Seeded logins (also in `sudarshan.json`):

- alice@example.com / Alice-Pass-2024!
- bob@example.com / Bob-Pass-2024!

These are demo credentials only. Change them before any real use.

## Routes

| Method | Path | Description |
| --- | --- | --- |
| POST | /auth/login | Get a JWT |
| GET | /recipes | List your recipes (with IDs) |
| GET | /recipes/:id | View one recipe |
| POST | /recipes | Create a recipe |
| PUT | /recipes/:id | Replace a recipe's fields |
| PATCH | /recipes/:id | Update only the fields you send |
| DELETE | /recipes/:id | Delete a recipe |

Recipes belonging to another user return 404.

## Example requests

Log in and store the token:

```
TOKEN=$(curl -s -X POST http://localhost:3012/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Alice-Pass-2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
```

List recipes:

```
curl -H "Authorization: Bearer $TOKEN" http://localhost:3012/recipes
```

View one:

```
curl -H "Authorization: Bearer $TOKEN" http://localhost:3012/recipes/1
```

Create:

```
curl -X POST http://localhost:3012/recipes \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Pancakes","ingredients":["200 g flour","2 eggs","300 ml milk"],"steps":["Whisk everything","Fry in a hot buttered pan"],"notes":"Rest the batter 10 minutes"}'
```

Edit:

```
curl -X PATCH http://localhost:3012/recipes/1 \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"notes":"Now with extra lemon"}'
```

Delete:

```
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3012/recipes/1
```

## Request body

- `name`: non-empty string (max 200 chars)
- `ingredients`: non-empty array of strings
- `steps`: non-empty array of strings
- `notes`: optional string (max 5000 chars)
