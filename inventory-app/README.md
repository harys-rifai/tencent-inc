# Database Inventory System

A Node.js REST API for managing database inventory with PostgreSQL and Redis caching.

## Prerequisites

- Node.js (LTS version)
- PostgreSQL (running on port 5432)
- Redis (running on port 6379)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
```
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=Password09
PG_DATABASE=bitdb
PG_SCHEMA=invschema
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3000
```

3. Ensure PostgreSQL database `bitdb` and schema `invschema` exist.

4. Start the server:
```bash
node server.js
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /inventory | List all inventory items (cached) |
| GET | /inventory/:id | Get single item by ID (cached) |
| POST | /inventory | Create new inventory item |
| PUT | /inventory/:id | Update existing item |
| DELETE | /inventory/:id | Delete item |

## Request Body (POST/PUT)

```json
{
  "type": "string",
  "appreff": "string",
  "ip": "192.168.1.1",
  "port": 5432,
  "version": "string",
  "active": true,
  "user_name": "string",
  "password": "string"
}
```

## Validation

- `port`: Must be between 1 and 65535
- `ip`: Must be valid IPv4 format