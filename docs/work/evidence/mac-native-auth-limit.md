VERDICT: INSTALLED_AND_HOOKS_OBSERVED; MODEL_VALIDATION_REQUIRES_REAUTHENTICATION

September 24, 2026, America/New_York. Actual bounded normal Claude runs on the Mac's default profile and one existing alternate profile reached native hook execution, then failed with expired OAuth and zero model tokens. The alternate profile received delegation 0.20.4 through the official marketplace install, with a prior backup; the default profile was untouched. SessionStart and UserPromptSubmit events were observed. No useful model artifact was produced.

`claude auth status` had reported loggedIn for the alternate profile. That metadata did not prove usable authentication; the actual model call discriminated it. Read-only expiry checks of the four other existing profiles found both access and refresh expiry in the past. No token values were printed, credentials copied, refresh requested, login initiated, or blind model retry performed.

Interactive reauthentication of a chosen existing profile is the remaining dependency for this host's Claude model validation. The canonical Notion decision is “Mac Claude live validation — restore login or defer.” Independent build and already qualified Windows use continue. Mac Git HTTPS authentication is a separate issue; the verified existing strict-SSH bundle route already completed the authorized source transfer.

Original private evidence: Temp/astra-followthrough-0923/0924-mac-claude-triage-live.md, 0924-mac-claude-acct2-install-runtime.md, and 0924-mac-claude-profile-expiry-check.md. This report deliberately contains no credentials or account identity.
