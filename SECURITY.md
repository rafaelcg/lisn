# Security Policy

## Supported status

Lissen is currently an early-stage open-source project and is not yet production-hardened.

Known security-sensitive limitations:

- the OpenAI API key is stored in the app settings file rather than the macOS Keychain
- release signing and notarization are not fully documented or automated
- Windows capture support is not considered stable

## Reporting a vulnerability

Please do not open a public GitHub issue for a suspected security vulnerability.

Instead, report it privately to:

- `rafaelcg@gmail.com`

Include:

- a description of the issue
- reproduction steps
- impact assessment if known
- logs, screenshots, or proof-of-concept details if relevant

I will triage reports as quickly as possible and follow up with mitigation or disclosure guidance.
