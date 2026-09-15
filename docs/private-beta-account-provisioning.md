# Private Beta Account Provisioning

AdLuv private-beta access is operator-provisioned. There is no public sign-up or checkout flow inside the product app.

## Provision a beta member

Run the worker CLI from the repo root:

```bash
yarn auth:provision-user -- --email "user@example.com" --username "user" --name "User Name" --role member
```

The command prompts for a temporary password unless `--password` is provided.

Valid roles are:

- `member`
- `admin`
- `owner`

## What the command does

- creates or updates the Better Auth user record
- normalizes and saves the username used by the login form
- creates or rotates the credential password hash
- initializes the user's default workspace
- ensures entitlements and notification settings exist so the account works on first login
- marks the email as verified because private-beta onboarding is handled manually

## Operator checklist

1. Provision the account with a unique temporary password.
2. Send the user their username and temporary password through your approved out-of-band channel.
3. Ask the user to sign in at the app login page and rotate the password from Settings after first access.
4. Re-run the provisioning command with a new `--password` value if you need to reset access.
