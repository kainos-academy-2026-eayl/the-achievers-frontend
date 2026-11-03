---
name: ticket
description: 'Use when the user invokes /ticket to start a session-based workflow: gather ticket details, suggest a branch, log feature development, then generate commit and PR descriptions.'
argument-hint: 'Provide KAN ticket number and details'
user-invocable: true
disable-model-invocation: true
---

# Ticket to branch and pull request

Implement a ticket-driven development workflow with session-based change tracking.

## Workflow Overview

This skill guides you through a ticket lifecycle:
1. **(A) Gather ticket details** — Ask for KAN number and full ticket description
2. **(B) Suggest branch name** — Generate `feature/KAN-*-kebab-case-summary`
3. **(C) Development phase** — Keep chat open while you implement features; log all changes to the branch
4. **(D) Generate commit message** — Single-sentence title: `KAN-* <imperative summary>`
5. **(E) Generate PR description** — Populate with Requirement, Why, Changes, Risks, and Testing sections

## Part A: Gather Ticket Details

When invoked, ask the user for:
1. **KAN number** — e.g., `KAN-123`
2. **Full ticket description** — Title, requirements, acceptance criteria, and any context needed

Store this ticket context for the entire session. Never invent or assume details not supplied.

## Part B: Suggest Branch Name

Generate a branch name using this format:
```
feature/KAN-<number>-<short-kebab-case-summary>
```

- Keep the KAN number uppercase, summary lowercase with single ASCII hyphens
- Remove punctuation and leading/trailing hyphens
- Example: `feature/KAN-42-add-product-inventory-tracking`

Present this to the user; they will create/checkout this branch independently.

## Part C: Development Phase — Keep Chat Open

After suggesting the branch, inform the user:
> "I'm ready to assist. Create the branch and let me know when you're ready to start. Provide feature requirements, and I'll suggest implementations based on our existing codebase structure. As you make changes, describe them to me so I can log them for the commit and PR descriptions."

**During this phase:**
- User will prompt you with feature tasks based on the ticket
- Base suggestions on existing file structure, patterns, and services (e.g., Controller/Service/Repository layers)
- **Strict scope**: Only implement or discuss features described in the ticket; never add assumptions or extras
- If unclear, ask the user before proceeding
- If the user requests scope changes, ask them to update the Jira ticket and paste the new version
- **Log all changes** — Keep a mental note of:
  - Files created or modified
  - What each change accomplishes
  - Any architectural patterns followed
- Accept multiple back-and-forth prompts; maintain context across the entire development session

## Part D: Commit Message (After Development)

When the user asks to record changes, generate **only the commit title**:

```
KAN-<number> <Imperative single-sentence summary>
```

- Must start with `KAN-<number>:`
- Must be a single sentence (no full stop at the end)
- Aim for 72 characters or fewer
- Imperative mood: "Add product stock tracking" not "Added product stock tracking"
- Example: `KAN-42 Add product inventory tracking with stock levels`

Do not generate a commit body; just the title.

## Part E: Pull Request Description (After Development + Testing)

When the user asks for the PR description, run unit tests and generate this template:

```markdown
## Requirement
Ticket KAN-<number>: <concise requirement and acceptance criteria>

## Why
<The problem or user impact this addresses>

## Changes
- <Concrete relevant change>
- <Concrete relevant change>

## Risks / Review Focus
- <Specific risk, limitation, or area to inspect>
- No specific risks identified if none are evident; ask reviewer to confirm acceptance criteria

## Testing
- `npm run test`: <pass/fail + generic test summary: what was tested, e.g., "Cart API tests, product creation tests passed">
- CI (runs automatically on this PR): build, lint, format check, unit tests

## End-to-end Testing

```

**Testing execution:**
- Actually run `npm run test` before generating the PR description
- Include only a generic summary (e.g., "User login and registration tests passed, order creation tests passed")
- Do not include verbose output
- If tests fail, report which test groups failed and note this in the description

## Accuracy and Scope

- Preserve exact ticket requirements. Do not assume features or add details beyond what is in the ticket.
- Keep the five PR headings exactly as shown, in that order
- Use evidence from changes made during Part C; distinguish completed work from planned work
- Only report test results you actually observed; never fabricate results
- If changes are incomplete, prefix Changes with `- Planned changes (not yet implemented):`
- For PR Risks section, be specific and concrete; never claim changes are "risk-free"
- Never commit, push, or create pull requests unless explicitly requested; generate text only
