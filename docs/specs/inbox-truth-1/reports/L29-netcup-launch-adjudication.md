VERDICT: AUTHORIZE FIRST SUITE LAUNCH

Root inspected the preserved Netcup stdout and exit receipt. Node could not resolve
the entrypoint /home/ben/scripts/run-tests.mjs and exited 1 with MODULE_NOT_FOUND
and an empty requireStack. The fetched candidate was d1345220822651c762fa5a5a461e5bbe94620c7c,
but the payload omitted changing into its checkout. The test runner never loaded;
no tests executed. The earlier PowerShell parse error likewise launched no suite.

Correct only the launch working directory, verify the checkout SHA and runner path,
and execute the first actual Netcup suite on this same candidate. Preserve the original
failed-launch files separately. Do not rerun Windows or repeat a test suite after a
test failure. This is correction of the invocation, not a new code candidate or a
successful sealed receipt. Root authorizes it under the existing second-host gate.
