# New APIs — Dislike, Rate Professional, Delete Messages

Base URL (production): `https://fitconnectbackend-production.up.railway.app`

All endpoints require the same auth as every other route:
```
Authorization: Bearer <Firebase ID token>
```

Errors follow the existing global format, with the relevant HTTP status code:
```json
{ "error": "message" }
```

## Quick reference

| Feature                | Method | Path                                       |
|-------------------------|--------|--------------------------------------------|
| Dislike / pass           | POST   | `/api/v1/matching/dislike/:targetUserId`    |
| Undo dislike             | DELETE | `/api/v1/matching/dislike/:targetUserId`    |
| Rate a professional      | POST   | `/api/v1/trainers/:trainerId/rate`          |
| List ratings             | GET    | `/api/v1/trainers/:trainerId/ratings`       |
| Remove my rating         | DELETE | `/api/v1/trainers/:trainerId/rate`          |
| Delete entire chat       | DELETE | `/api/v1/messages/:matchId`                 |
| Delete single message    | DELETE | `/api/v1/messages/:matchId/:messageId`      |
| Register Pro interest    | POST   | `/api/v1/pro/interest`                      |
| My Pro interest status   | GET    | `/api/v1/pro/interest`                      |
| Withdraw Pro interest    | DELETE | `/api/v1/pro/interest`                      |
| Admin: list Pro interest | GET    | `/api/v1/admin/pro-interest`                |

> ⚠️ **Backend status**: these routes are deployed, but the underlying database tables (`dislikes`, `professional_ratings`, `pro_interest`) have not been created in the production Supabase project yet. These APIs will currently return `500 { "error": "Could not find the table '...' ..." }` until those migrations are run. This doc describes the intended/target contract for frontend integration to start against.

---

## 1. Dislike ("Pass") a fitbuddy

Hides a user from your discovery feed for 30 days. Re-disliking resets the timer; disliking someone also cancels any pending like from you to them (so it can never turn into a match later).

### `POST /api/v1/matching/dislike/:targetUserId`

**Request body**: none

**Response `200`**
```json
{
  "disliked": true,
  "hidden_until": "2026-08-22T10:15:00.000Z"
}
```

**Errors**
| Status | Body | Cause |
|---|---|---|
| 400 | `{ "error": "Cannot dislike yourself" }` | `targetUserId` is the caller |
| 404 | `{ "error": "User not found" }` | target user doesn't exist |

### `DELETE /api/v1/matching/dislike/:targetUserId`
Undo a pass before it expires — the user reappears in discovery immediately.

**Request body**: none

**Response `200`**
```json
{ "undone": true }
```

---

## 2. Rate a Professional

One rating per (professional, rater) pair — calling `POST` again edits your existing rating/review instead of creating a duplicate. The professional's aggregate `rating` and `reviews_count` (already shown on trainer profiles today) are recomputed automatically on every write.

### `POST /api/v1/trainers/:trainerId/rate`

**Request body**
```json
{
  "rating": 5,
  "review": "Great session, very knowledgeable."
}
```

| field  | type    | required | notes            |
|--------|---------|----------|------------------|
| rating | integer | yes      | 1–5              |
| review | string  | no       | max 2000 chars   |

**Response `201`**
```json
{
  "id": "b1e6c1a0-3f2e-4d9a-9c1a-2f5e6d7c8b90",
  "professional_id": "DJMAECRqJOVbKMe64oCqrZorbYM2",
  "rater_user_id": "aBcDeFgHiJkLmNoPqRsTuVwXyZ12",
  "rating": 5,
  "review": "Great session, very knowledgeable.",
  "created_at": "2026-07-23T10:00:00.000Z",
  "updated_at": "2026-07-23T10:00:00.000Z"
}
```

**Errors**
| Status | Body | Cause |
|---|---|---|
| 400 | `{ "error": "rating must be an integer between 1 and 5" }` | invalid `rating` |
| 400 | `{ "error": "Cannot rate yourself" }` | rating your own account |
| 404 | `{ "error": "Trainer not found" }` | `trainerId` doesn't exist or isn't a professional |

### `GET /api/v1/trainers/:trainerId/ratings?page=1&limit=20`

**Query params**: `page` (default `1`), `limit` (default `20`, max `50`)

**Response `200`**
```json
{
  "ratings": [
    {
      "id": "b1e6c1a0-3f2e-4d9a-9c1a-2f5e6d7c8b90",
      "rating": 5,
      "review": "Great session, very knowledgeable.",
      "created_at": "2026-07-23T10:00:00.000Z",
      "rater": {
        "id": "aBcDeFgHiJkLmNoPqRsTuVwXyZ12",
        "name": "Jane Doe",
        "avatar_url": "https://.../avatar.jpg"
      }
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20,
  "has_more": false
}
```

### `DELETE /api/v1/trainers/:trainerId/rate`
Removes the caller's own rating of this trainer.

**Request body**: none

**Response `200`**
```json
{ "deleted": true }
```

---

## 3. Delete Messages

Hard deletes — the message(s) are removed for both participants, along with any attached file(s) in storage. There is no "delete for me only" — this is a permanent delete for the whole chat.

### `DELETE /api/v1/messages/:matchId`
Deletes the entire chat: every message in the match plus their attachments. The match itself is **not** deleted — the conversation thread stays, just empty.

**Request body**: none

**Response `200`**
```json
{ "message": "Chat deleted" }
```

**Errors**
| Status | Body | Cause |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | caller isn't a participant in this match |

### `DELETE /api/v1/messages/:matchId/:messageId`
Deletes a single message and its attachment (if any). **Only the original sender can delete their own message** — the recipient cannot delete a message sent to them.

**Request body**: none

**Response `200`**
```json
{ "message": "Message deleted" }
```

**Errors**
| Status | Body | Cause |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | caller isn't a participant in this match |
| 403 | `{ "error": "Only the sender can delete this message" }` | caller isn't the sender of `messageId` |
| 404 | `{ "error": "Message not found" }` | `messageId` doesn't belong to `matchId` |

---

## 4. FitConnect Pro — Register Interest

Powers the "Register Interest" CTA on the Pro upsell screen (professional users only). One registration per user — calling it again just returns the original timestamp instead of erroring. Lets the team see, in the admin panel, how many professionals want Pro.

### `POST /api/v1/pro/interest`

**Request body**: none

**Response `201`** (first time)
```json
{
  "registered": true,
  "already_registered": false,
  "registered_at": "2026-07-24T10:00:00.000Z"
}
```

**Response `200`** (already registered — idempotent)
```json
{
  "registered": true,
  "already_registered": true,
  "registered_at": "2026-07-24T10:00:00.000Z"
}
```

**Errors**
| Status | Body | Cause |
|---|---|---|
| 403 | `{ "error": "Only professional accounts can register interest in Pro" }` | caller's `user_type` isn't `professional` |
| 404 | `{ "error": "Profile not found" }` | caller has no profile row |

### `GET /api/v1/pro/interest`
Check whether the caller has already registered — use this to decide whether to show "Register Interest" or a confirmed/disabled state on screen load.

**Response `200`**
```json
{
  "registered": true,
  "registered_at": "2026-07-24T10:00:00.000Z"
}
```
or, if never registered:
```json
{
  "registered": false,
  "registered_at": null
}
```

### `DELETE /api/v1/pro/interest`
Withdraw a previously registered interest.

**Response `200`**
```json
{ "withdrawn": true }
```

### `GET /api/v1/admin/pro-interest` *(admin panel only)*
Requires an admin account (`is_admin = true`), not a regular user token.

**Query params**: `page` (default `1`), `limit` (default `20`, max `100`)

**Response `200`**
```json
{
  "registrations": [
    {
      "id": "c2f7d2b1-...",
      "created_at": "2026-07-24T10:00:00.000Z",
      "user": {
        "id": "DJMAECRqJOVbKMe64oCqrZorbYM2",
        "name": "Alex Trainer",
        "email": "alex@example.com",
        "phone": "+91...",
        "avatar_url": "https://.../avatar.jpg",
        "specialty": ["Strength Training"],
        "location": "Mumbai"
      }
    }
  ],
  "total": 34,
  "page": 1,
  "limit": 20,
  "has_more": true
}
```
`total` is the running count for the admin dashboard tile ("34 professionals interested in Pro").
