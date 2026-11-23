# Haliç school Microsoft sign-in

The public sign-in page can offer Microsoft school login alongside the existing local login. Each student authorizes their own school account. Only the Haliç tenant and a numeric `@ogr.halic.edu.tr` directory user principal name are accepted. Personal Microsoft accounts and other tenants are rejected.

## App registration

In Microsoft Entra admin center, open **App registrations → New registration**:

- Name: `HalicMind`
- Supported account types: **Accounts in any organizational directory**. This allows an app registered in the project's own tenant to be used by the school tenant, subject to its consent policy.
- Redirect platform: **Web** (the backend exchanges the authorization code).
- Redirect URI: `https://halic-mind-source.pages.dev/api/v1/auth/microsoft/callback`
- Delegated Microsoft Graph permission: `User.Read`.
- Create a client secret under **Certificates & secrets**. Save the secret value securely; it is not the secret ID. Record its expiry and rotate it before it expires.

Authentication requests use the school's tenant-specific authorization endpoint, never `/common`. The school tenant was resolved from `https://login.microsoftonline.com/ogr.halic.edu.tr/v2.0/.well-known/openid-configuration` as `23fffcb6-2a4a-4b0c-b169-a2e1a5fefa4f`. The code pins this issuer and tenant, and validates RS256 signatures with the tenant's Microsoft signing keys.

The school's policy may require an IT administrator to approve the application. Creating our own registration cannot override that policy. A real school account must complete the end-to-end consent test before enabling this for students.

## Render configuration

Apply Alembic migration `0008_microsoft_login` first. Then configure these Render environment variables together:

```dotenv
MICROSOFT_CLIENT_ID=<application-client-id>
MICROSOFT_CLIENT_SECRET=<secret-value>
PUBLIC_ORIGIN=https://halic-mind-source.pages.dev
```

Keep both credentials in Render, never in Cloudflare Pages or Git. For a local handoff, put the two credential values in an ignored `.env.microsoft` file at the repository root. With no credentials configured, UI configuration disables the Microsoft button and the OAuth routes return 404.

Use the canonical Pages production URL. The Pages Function proxies `/api/*` and preserves OAuth state and session cookies; a preview URL or a direct Render URL cannot share the production OAuth cookie. There are no client-selectable redirect destinations.

## Account behavior

- Start: `/api/v1/auth/microsoft/start` creates a 10-minute signed HttpOnly/Secure flow cookie, state, nonce and PKCE challenge.
- Callback exchanges the one-time code, validates the ID token, then obtains the student's directory UPN through Graph `/me`. Editable email claims do not determine account ownership.
- First login creates a verified student account and a HalicMind HttpOnly/Secure session. No school password is collected or stored.
- A matching existing verified account is linked to its Microsoft object ID. Existing academic data remains attached to that account.
- For a pre-created unverified local account, the old password/reset code is invalidated before Microsoft verification so it cannot be used to take over the school owner's account.
- Disabled accounts, conflicting links and changed linked addresses are rejected. OAuth errors return a fixed message without provider tokens or authorization codes.
- No Microsoft access/refresh token is retained. Login does not grant mailbox/calendar access; those integrations require separate permissions and consent later.

## Verification

Tests cover token signature/issuer/audience/expiry, nonce and school tenant restrictions, CSRF state, PKCE, secure cookies, callback replay, identity conflicts and unverified account takeover prevention. Deployment still requires a real school-account consent/login test.
