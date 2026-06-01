---
sidebar_position: 21
---

# User management

Interakt's admin dashboard is multi-user. The **User Management** screen is where admins create accounts for the rest of the team, assign roles, and disable accounts when people leave.

## Where to find it
Sidebar → **Administration → User Management**.

## The screen

### Stats cards
- **Total Users** count.
- **Active Users** count and percentage.
- **Inactive Users** count.
- **Admins** count.

### Filters
- **Search** by name or email.
- **Role** dropdown — All / Admin / Moderator / User.
- **Status** dropdown — All / Active / Inactive.

### User table

| Column | What |
|---|---|
| **Name** | First and last. |
| **Email** | Login email. |
| **Role** | Admin / Moderator / User. |
| **Status** | Active or Inactive. |
| **Created** | When the account was added. |
| **Actions** | Edit / Change Password / Activate-Deactivate / Delete. |

### Add User button

Opens the create dialog. Fields:
- **First name**, **last name**.
- **Email** — used to log in.
- **Role** — see below.
- **Initial password** — set or auto-generate.

Click **Save**. The user can log in with the email and password you set.

## Roles

Three roles, each with a set of permissions.

### Admin
Full access to everything. Can:
- Manage users (add, edit, delete, change roles).
- Manage AI providers, secrets, settings.
- Create, edit, delete experiences, indexes, data sources, tools, prompt templates.
- View all analytics.
- Trigger and reset the demo / setup.

Most installations have 1–3 admins.

### Moderator
Can do most day-to-day work but can't change global settings or other users. Can:
- Create, edit, delete experiences and the resources behind them (indexes, tools, prompts).
- View analytics.
- Use the playground.

Can **not**:
- Manage users.
- Change AI provider configuration.
- Reset / re-seed.

This is the right role for content / catalog / data team members.

### User
Read-only-ish access. Can:
- View experiences, indexes, tools, dashboards.
- Use the playground.

Can **not**:
- Edit or create anything.
- Manage other users.
- Change settings.

This is the right role for stakeholders who need to see what's there but shouldn't be able to change it. Engineers, analysts, the curious.

## Changing a user's role

In the user's row, open the dropdown → **Edit** → change the role → save. Takes effect on their next page load.

If you're demoting yourself, be careful — you can lock yourself out of admin capabilities if you're the only admin.

## Changing a password

Two paths:
1. **An admin changes someone else's password.** User row → dropdown → **Change Password**. Set a new one and hand it to them.
2. **A user changes their own password.** Account menu (top-right) → "Change Password". May require entering the current password.

There's no self-service "forgot password" flow in the admin UI — an admin has to reset.

## Activating / deactivating a user

Toggle the **Status**. An inactive user:
- Cannot log in.
- Still exists in the database.
- Their actions in the audit log are preserved.

This is the right way to handle someone leaving the company. Don't delete unless you really need to — you lose attribution on their past actions.

## Deleting a user

Permanent. Confirms before doing it. Use only if you really mean it.

## Common gotchas

- **Locking out the only admin.** If you demote yourself or deactivate the only admin account, no one can manage users. Recovery requires database access. Always have at least two admins.
- **Forgetting that Moderator can't manage AI providers.** A Moderator who tries to add a provider gets a permission error. Promote them temporarily or have an admin do it.
- **Sharing accounts.** Don't. Create one per person — the audit log and analytics are per-user. Shared accounts make traces useless.
- **No SSO yet.** Authentication is local — there's no SAML / OIDC / Google integration in the admin UI today.

## Where to go next

- [Navigating the admin](../admin-tour/navigation) — the layout of the dashboard your users will see.
- [Access tokens](access-tokens) — separate from user logins, this is how *applications* authenticate.
