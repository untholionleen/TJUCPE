# Security and privacy notes

## Repository visibility

The repository was verified as Public at initial deployment. Only generic source code, SQL schema and public documentation are committed. Uploaded student reports, spreadsheets containing personal or grade information, class rosters and private teaching materials are excluded.

For stronger source-code privacy, the repository owner may change it to Private in GitHub Settings → General → Danger Zone → Change repository visibility. This action is not available through the connected GitHub repository tools in this session.

## Credentials

- The Supabase URL and publishable key are intended for browser use.
- RLS, private Storage and role-guard triggers must be applied before real student data is used.
- Never commit service-role keys, secret API keys, database passwords, OAuth client secrets, GitHub tokens or CI deployment tokens.
- If a secret credential is ever exposed, rotate it from its provider dashboard.

## Student data

- Report files are stored in the private lab-reports bucket.
- Storage object paths begin with the authenticated user's UUID.
- Signed download links expire quickly.
- The student client cannot change score, feedback, reviewer identity or role.
- Teacher and administrator access is enforced in the database as well as the UI.
- Keep original reports and raw data private; do not place them in this repository or issue comments.

## Scope and limitations

The repository does not claim end-to-end encryption at the application layer. Database/storage encryption-at-rest and transport security depend on Supabase's service configuration. Retention periods, backups, access reviews, MFA and incident response still need to be established by the institution.
