VERDICT: APPROVE FOR OWNER DECISION — revised scoped proposal only; no OS execution authorized.

Reviewed the three private diagnosis/plan reports and exact extracted Ubuntu profile: bwrap-userns-restrict-4.0.1really4.0.1-0ubuntu0.24.04.7.profile,1936bytes, SHA25611d39094f044f0cda0febb3ad517b830301da6b2ce929664af09ee9e4dd264f9 (independently matched). Package provenance and bubblewrap-only simulation are attributed to Sol; I did not independently inspect the package archives.

Present one choice with two options:
- Continue useful work on qualified hosts; leave Hetzner sandbox support unresolved.
- Authorize one scoped administrator audit and, only if it confirms the documented restriction/path, the reviewed official prerequisite repair plus bounded validation/rollback.

Replace the earlier three-package install proposal. Sol reports existing parser/status tools and a bubblewrap-only transaction installing exactly bubblewrap0.9.0-1ubuntu0.3. Do not install apparmor-profiles/utils. Pin/recheck the package and reviewed-profile hashes; abort on additional transaction changes.

Admin preconditions: capture the matching denial and loaded policy; establish Codex actually selects /usr/bin/bwrap. Check existing profiles named bwrap AND unpriv_bwrap, existing policy files and both optional local includes. Back up existing state; do not overwrite conflicting policy. The profile is broadly permissive for its launcher and explicitly denies child capabilities; it is executable-scoped, not globally restrictive. Loading it affects every /usr/bin/bwrap consumer, not just Codex. Status verification must use actual profile names bwrap/unpriv_bwrap, not filename bwrap-userns-restrict.

Sol reports bubblewrap postinst reapplies kernel.unprivileged_userns_clone from system configuration. Inspect that setting and relevant configured values before install; stop if the transaction would unexpectedly change it. Preserve kernel.apparmor_restrict_unprivileged_userns=1 throughout; no bypass or global restriction disable.

Acceptance: reviewed profile loads without unrelated changes; explicit read-only/never sandbox runs /bin/true and the installed-skill read with expected hash; then one authorized finite native read confirms parity. No automatic retries after denial.

Rollback: unload only newly introduced profiles, restore backed-up files/policy and any deliberately changed recorded sysctl; remove only the newly installed bubblewrap package after checking new dependents. No autoremove or broader package/policy cleanup. Record failures and retain qualified-host operation.

Plugin rollout authorization does not cover this OS change. Lower-level enforcement remains unproven until the administrator audit.
