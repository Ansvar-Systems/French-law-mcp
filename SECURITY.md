# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this MCP server, please report it responsibly:

1. **Do NOT open a public issue**
2. Email: security@ansvar.eu
3. Include: description, reproduction steps, potential impact

We aim to acknowledge reports within 48 hours and provide a fix within 7 days for critical issues.

## Security Architecture

- **Read-only**: No write operations to the database
- **No network calls**: All data served from local SQLite
- **No authentication**: Public reference data only
- **No secrets**: No API keys or credentials required
- **Input validation**: All inputs sanitized before database queries
- **SQL injection prevention**: Parameterized queries throughout

## Dependencies

Dependencies are monitored via GitHub Dependabot and updated regularly. Security scanning is enabled via GitHub Advanced Security (CodeQL + secret scanning).
