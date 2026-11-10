---
sidebar_position: 21
---

# Users and roles

Interakt's admin dashboard is multi-user. Every user has one **role**, and the role decides what they can see and do. The **User Management** screen is where you add accounts, give each one a role, edit roles, and deactivate accounts when people leave.

## Where to find it
Sidebar → **Administration → User Management**. It has two tabs: **Users** and **Roles**.

## Users

### Stats cards
- **Total Users**, **Active**, **Inactive**, and **Admins**.

### Filters
- **Search** by name or email.
- **Role**: every role on the Roles tab.
- **Status**: Active or Inactive.

### Add User
Opens the create dialog: first and last name, email (used to log in), initial password, and **Role**. The role list shows the roles you can hand out (see [Who can give which role](#who-can-give-which-role)).

### Edit and deactivate
From the user's row. Changes to someone's role or status apply on their **next request**: Interakt reads each user's role and status on every request, so a deactivated user loses access on their next request, and a new role applies straight away.

## Roles

A role is a name and a set of permissions. Interakt ships with three:

| Role | What it can do |
|---|---|
| **Admin** | Everything, including users and roles, secrets, AI provider keys, and the demo and docs setup. Built in: it always holds every permission, including ones added in later versions, and can't be edited or deleted. |
| **Editor** | Builds and runs the search: experiences, indexes and documents, data sources, tools and MCP connections, prompts and knowledge, analytics and tracing settings, system settings, and the playgrounds. Views AI providers and background jobs. |
| **Viewer** | Read-only: experiences, indexes, data sources, tools, prompts and analytics. |

Editor and Viewer are ordinary roles: rename them, change their permissions, or delete them. Add your own roles on the **Roles** tab with **Add Role**, for example an *Analyst* role with only the analytics permissions.

### Permissions

Permissions come in groups, each with a view permission and one to change things:

- **Experiences**: search experiences; chat experiences.
- **Data**: search indexes; documents (upload, edit, delete, reindex); data sources.
- **AI configuration**: tools and MCP connections; prompt templates, knowledge base and domain knowledge; AI providers and models. Viewing providers never shows their keys.
- **Testing and analytics**: the playgrounds and test buttons (these spend AI tokens); viewing analytics, conversations, traces and what the assistant remembers about visitors; asking the analytics assistant; changing analytics and tracing settings and dismissing tips.
- **System**: settings and background jobs; running jobs; secrets and ingestion keys; users and roles; the demo and docs setup.

Tools, MCP connections and data sources that use a secret from the vault can be set up or changed only by a role that can manage secrets. An experience's access token, and its widget snippet, are shown to roles that can edit that kind of experience.

A permission to change something includes the one to see it, and asking the analytics assistant includes viewing analytics; the Roles dialog shows these as included. Running the demo and docs setup takes effect only together with the permissions for what it sets up: AI providers, settings, indexes and documents, data sources, experiences, tools and prompts.

The sidebar shows each user the pages their role can open, and the server checks the role on every request.

## Who can give which role

Anyone with the *Manage users and roles* permission can add users, edit roles and assign them, within one rule: **you can only give out what you have yourself**.

- You can assign a role, create one, or change one only when every permission in it is one of yours.
- Only an Admin can make someone an Admin, or manage a user who is an Admin.
- You can't change your own role or deactivate yourself. Another user manager does that.
- Interakt always keeps at least one active Admin.

A role can be deleted once no user holds it.

## Changing your password

Account menu (top right) → **Change password**. Enter your current password and the new one.

## Deactivating a user

Deactivate from the user's row. An inactive user can't sign in, loses access on their next request, and keeps their history (analytics and traces stay attributed). Activate them again from the same row.

## Good practice

- **Two Admins.** Keep a second Admin account so someone can always manage users.
- **One account per person.** Analytics and traces are per user.
- **Least access.** Start people as Viewers and give more when they need it.

## Where to go next

- [Navigating the admin](../admin-tour/navigation): the layout of the dashboard your users will see.
- [Access tokens](access-tokens): separate from user logins, this is how *applications* authenticate.
