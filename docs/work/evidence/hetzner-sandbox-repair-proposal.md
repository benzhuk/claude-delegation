VERDICT: CONCRETE NARROW REPAIR PREPARED, NOT EXECUTED.

Official Ubuntu Noble package `apparmor-profiles` `4.0.1really4.0.1-0ubuntu0.24.04.7` (source `apparmor`) was downloaded as data only. Package SHA-256: `bdac5b74d884643653565c52ed7483c9582e646ff72cce8d95d0eb8467a3139c`.

Its sole named archive member `usr/share/apparmor/extra-profiles/bwrap-userns-restrict` was extracted without maintainer scripts. Local review copy: `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/bwrap-userns-restrict-4.0.1really4.0.1-0ubuntu0.24.04.7.profile`; 1,936 bytes; SHA-256 `11d39094f044f0cda0febb3ad517b830301da6b2ce929664af09ee9e4dd264f9`. It binds `profile bwrap /usr/bin/bwrap` and permits user namespaces.

Do not install `apparmor-profiles` or `apparmor-utils`; `/usr/sbin/apparmor_parser` and `/usr/sbin/aa-status` already exist. A pinned simulation of `bubblewrap=0.9.0-1ubuntu0.3` installs exactly one package: 0 upgraded/removed. Package SHA-256 is `2461f1beee9cb04c8942739fe1a2b37e7b7c2a3d518f0779dc75f9245baa3094`. Its only maintainer script runs `sysctl --quiet --pattern '^kernel\.unprivileged_userns_clone$' --system || :`; it bundles no AppArmor policy.

After staging the reviewed profile at `/tmp/bwrap-userns-restrict.reviewed` and verifying its hash, proposed commands are:

```sh
sudo apt-get install bubblewrap=0.9.0-1ubuntu0.3
sudo install -o root -g root -m 0644 /tmp/bwrap-userns-restrict.reviewed /etc/apparmor.d/bwrap-userns-restrict
sudo apparmor_parser -r /etc/apparmor.d/bwrap-userns-restrict
```

Keep `kernel.apparmor_restrict_unprivileged_userns=1`. Validate `/usr/bin/bwrap`, loaded profile, explicit Codex `/bin/true`, and the prior hash-checked read. No install/profile/policy action occurred; remote temporary downloads were removed and the terminal closed.

Final preflight found both optional includes absent: `/etc/apparmor.d/local/bwrap-userns-restrict` and `/etc/apparmor.d/local/unpriv_bwrap`. No site override would currently alter the reviewed profile. The live `kernel.unprivileged_userns_clone` value is `1`; no assignment for that key exists in the allowlisted applicable `sysctl.conf`/`sysctl.d` files. Recheck these facts immediately before installation because local configuration can change. Loaded-profile names and kernel audit evidence remain administrator-only prerequisites. The final read-only terminal closed with `ptyKilled:true`.
