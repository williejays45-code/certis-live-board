# Software suggestions grounded in the recorded failures

No subscriptions, hosted monitors or paid model calls were activated by this build.

| Software | Purpose in EnTrus | Adoption decision |
| --- | --- | --- |
| GitHub Actions + required checks/rulesets | Run the engine on every changed branch; separate build and promotion | Use existing CI now. Confirm plan support before requiring rulesets on private LANDITRUS. Never make it public just to obtain enforcement. |
| Trivy | Dependency/container vulnerabilities, misconfiguration and secret scanning; complement this engine's limited patterns | Next scanner integration. Pin the binary/image and database revision; stale or missing DB is UNKNOWN. Do not auto-install during a deploy. |
| OPA / Conftest | Policy checks for deployment/IAM configuration | Useful when policy volume grows. Port tested rules with parity fixtures; avoid maintaining divergent Python and Rego truth. |
| Playwright + axe-core | Customer journey, mobile rendering and accessibility tests | Extend existing browser acceptance; use synthetic checkout fixtures, not repeat real charges. |
| OpenTelemetry | Correlate queue, bridge, engine and customer response using one request ID | Instrument metadata only; no tokens, prompts, private evidence or user financial details in telemetry. |
| Gitleaks CLI | Repository-history credential scanning with redacted findings | Optional complement. Current upstream says feature complete/security patches only; evaluate lifecycle before new adoption. Never print matched secrets. |

Primary sources reviewed:

- [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Trivy documentation](https://trivy.dev/docs/)
- [Conftest](https://www.conftest.dev/)
- [Playwright accessibility](https://playwright.dev/docs/accessibility-testing)
- [OpenTelemetry](https://opentelemetry.io/docs/)
- [Gitleaks upstream](https://github.com/gitleaks/gitleaks)

Start with existing CI plus the engine and one mature scanner, then add browser
acceptance and tracing where gaps are demonstrated. A larger tool stack alone does
not prevent repeat sign-in requests, false status claims or incorrect source lineage.
