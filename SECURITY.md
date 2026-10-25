# Security Policy & Responsible Disclosure

The AccessAI team takes software security and user privacy seriously. We appreciate the responsible disclosure of vulnerabilities discovered in our codebase.

---

## Supported Versions

Security updates and patches are applied to the active development branch:

| Version | Supported |
| :--- | :---: |
| `main` (Latest) | :white_check_mark: |
| Older releases | :x: |

---

## Reporting a Vulnerability

If you identify a security vulnerability in AccessAI, **please do not disclose it publicly** via GitHub Issues or public discussions.

### Reporting Process
1. Report the vulnerability privately via **GitHub Private Vulnerability Reporting** on the repository page (under the "Security" tab -> "Report a vulnerability").
2. Include the following details in your report:
   - Vulnerability type (e.g., SSRF bypass, prompt injection escape, rate-limit circumvention, injection flaw).
   - Step-by-step reproduction instructions or a minimal proof of concept (PoC).
   - Affected files and components.
   - Proposed remediation or patch, if available.
3. You will receive an initial response acknowledging your report within 48 hours.
4. We will coordinate a remediation timeline and release a patch before public disclosure.

---

## Security Boundaries & Design Assumptions

When auditing AccessAI, please consider the established security boundaries:
- **SSRF Defenses:** Destination IPs must be public unicast. Attacks that bypass loopback or cloud metadata filters (`169.254.169.254`) are considered valid findings.
- **AI Remediation:** Webpage snippets are treated as untrusted. Bypasses that lead to code execution on the server or client are high severity. Note: AI suggestions are displayed as text recommendations and are never auto-executed by design.
- **Rate Limiting:** The in-memory sliding-window limiter is process-local. Distributed denial-of-service against single-process instances is an acknowledged architectural constraint.
