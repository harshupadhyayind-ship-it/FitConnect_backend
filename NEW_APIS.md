# New APIs — Dislike, Rate Professional, Delete Messages

All endpoints require `Authorization: Bearer <Firebase ID token>` (same as every other route).
Errors follow the existing global format: `{ "error": "message" }` with the relevant HTTP status.

---

## 1. Dislike ("Pass") a fitbuddy

Hides a user from your discovery feed for 30 days. Re-disliking resets the timer; disliking someone also cancels any pending like from you to them.

### `POST /api/v1/matching/dislike/:targetUserId`

**Response `200`**
```json
{
  "disliked": true,
  "hidden_until": "2026-08-22T10:15:00.000Z"
}
```

**Errors**: `400` (disliking yourself), `404` (target user not found)

### `DELETE /api/v1/matching/dislike/:targetUserId`
Undo a pass before it expires — the user reappears in discovery immediately.

**Response `200`**
```json
{ "undone": true }
```

---

## 2. Rate a Professional

One rating per (professional, rater) pair — calling it again edits your existing rating/review. `profiles.rating` and `profiles.reviews_count` are recomputed automatically on every write.

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
  "id": "b1e6c1a0-...",
  "professional_id": "firebaseUidOfTrainer",
  "rater_user_id": "firebaseUidOfCaller",
  "rating": 5,
  "review": "Great session, very knowledgeable.",
  "created_at": "2026-07-23T10:00:00.000Z",
  "updated_at": "2026-07-23T10:00:00.000Z"
}
```

**Errors**: `400` (invalid rating / rating yourself), `404` (trainer not found or not a professional)

### `GET /api/v1/trainers/:trainerId/ratings?page=1&limit=20`

**Response `200`**
```json
{
  "ratings": [
    {
      "id": "b1e6c1a0-...",
      "rating": 5,
      "review": "Great session, very knowledgeable.",
      "created_at": "2026-07-23T10:00:00.000Z",
      "rater": { "id": "firebaseUid", "name": "Jane Doe", "avatar_url": "https://..." }
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

**Response `200`**
```json
{ "deleted": true }
```

---

## 3. Delete Messages

Hard deletes — removes the row(s) for both participants and any attached file(s) from storage.

### `DELETE /api/v1/messages/:matchId`
Deletes the entire chat: every message in the match plus their attachments.

**Response `200`**
```json
{ "message": "Chat deleted" }
```

**Errors**: `403` (not a participant in this match)

### `DELETE /api/v1/messages/:matchId/:messageId`
Deletes a single message and its attachment (if any). Only the original sender can delete their own message.

**Response `200`**
```json
{ "message": "Message deleted" }
```

**Errors**: `403` (not a participant, or not the sender), `404` (message not found)
