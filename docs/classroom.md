# Google Classroom

Each verified HalicMind student connects their own Google account from **Bağlantılar**. The Classroom Web OAuth client is separate from the Desktop OAuth client used by the application's Gmail sender. Connecting Classroom never grants mailbox access.

## Google configuration

Enable **Google Classroom API** in the existing HalicMind Google Cloud project. Create a **Web application** OAuth client with this authorized redirect URI:

`https://halic-mind-source.onrender.com/api/v1/integrations/google/callback`

Declare these Classroom scopes in Google Auth Platform → Data Access:

- `https://www.googleapis.com/auth/classroom.courses.readonly`
- `https://www.googleapis.com/auth/classroom.coursework.me.readonly`

The connection also requests `openid email` to verify the connected Google account. Google account identity is not used to sign the student into HalicMind; the student must already have a verified HalicMind session.

If the Google application is in Testing, add each connecting Google address as a test user. Test-mode offline grants may expire in seven days. Public student rollout may require Google's sensitive-scope verification, and a school's Workspace policy may require administrator approval. An OAuth client JSON file alone does not enable the Classroom API or satisfy these requirements.

## Backend configuration

Apply migration `0009_classroom` before deploying the new code. Set these only in Render Environment:

```dotenv
CLASSROOM_CLIENT_ID=<Web-client-id>
CLASSROOM_CLIENT_SECRET=<Web-client-secret>
INTEGRATION_ENCRYPTION_KEY=<independent-Fernet-key>
PUBLIC_ORIGIN=https://halic-mind-source.onrender.com
```

Keep a secure copy of the encryption key; changing it makes saved Google connections unreadable and students will need to reconnect. Never expose it, refresh tokens or the client secret in Pages or Git. The ignored `.env.classroom` file is only a local setup handoff. Do not replace Gmail or JWT secrets.

OAuth uses state, nonce, PKCE, a signed expiring Secure/HttpOnly cookie bound to the current HalicMind user and session version, and a verified Google ID token. Refresh tokens are encrypted with Fernet before database storage. API responses expose only connection status, Google email and last import time.

## Student workflow

1. Open **Bağlantılar → Google Classroom’u bağla** and authorize the account used for Classroom.
2. Choose a HalicMind term and 1–20 active classes in which the Google user is a student.
3. Prepare a preview. Review course names, assignment titles and deadlines in Istanbul time.
4. Confirm the import. The single-use, user-bound preview expires after 15 minutes.

New courses are private personal courses in the selected term. Stable external identities prevent duplication across repeated imports. Imports update source-controlled assignment title, description and deadline, while preserving local completion, priority, workload estimate and archive state. Archived courses/assignments remain archived. Google submission status and grades are not imported in this version.

Assignments without a deadline are counted and excluded because HalicMind currently requires a due date. Missing Classroom dueTime uses Google's documented 23:59 UTC default. No deadline is invented for undated work. Archived or deleted Google coursework is not automatically deleted from HalicMind.

This version is an explicit preview-and-import workflow, not unattended background synchronization. Removing a connection deletes its saved Google grant and preview from HalicMind; already imported academic records remain. The backend does not revoke the entire Google project grant because it may also be used by the independent Gmail sender.

## Endpoints

All endpoints require the student's verified session. Cookie-authenticated writes enforce the existing same-origin header/Origin checks.

- `GET /api/v1/integrations/google`: status
- `POST /api/v1/integrations/google/connect`: begin OAuth
- `GET /api/v1/integrations/google/callback`: receive authorization
- `GET /api/v1/integrations/google/courses`: read active student courses
- `POST /api/v1/integrations/google/preview`: create user-bound preview
- `POST /api/v1/integrations/google/import`: consume preview atomically
- `DELETE /api/v1/integrations/google`: remove local connection

Synthetic tests cover ownership, state/session binding, nonce/issuer/audience/scope validation, encrypted tokens, pagination, date conversion, replay/expiry, idempotent imports, completion/archive preservation and disconnect behavior. Complete a real Google-account authorization and import test before enabling broad student use.
