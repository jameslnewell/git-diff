# v0.7.3 (Thu Oct 08 2026)

#### 🐛 Bug Fix

- Adopt @jameslnewell configs v7: TypeScript 7, ESLint and Vitest [#50](https://github.com/jameslnewell/git-diff/pull/50) ([@jameslnewell](https://github.com/jameslnewell))

#### 🔩 Dependency Updates

- Bump actions/checkout from 4 to 7 [#9](https://github.com/jameslnewell/git-diff/pull/9) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump actions/setup-node from 4 to 7 [#8](https://github.com/jameslnewell/git-diff/pull/8) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump @jameslnewell/typescript-config from 5.0.1 to 6.0.0 [#16](https://github.com/jameslnewell/git-diff/pull/16) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump @jameslnewell/prettier-config from 1.2.1 to 2.0.0 [#13](https://github.com/jameslnewell/git-diff/pull/13) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump @types/node from 22.15.21 to 26.6.4 [#45](https://github.com/jameslnewell/git-diff/pull/45) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump actions/download-artifact from 4 to 8 [#11](https://github.com/jameslnewell/git-diff/pull/11) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump actions/cache from 4 to 5 [#10](https://github.com/jameslnewell/git-diff/pull/10) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump dependabot/fetch-metadata from 2 to 3 [#7](https://github.com/jameslnewell/git-diff/pull/7) ([@dependabot[bot]](https://github.com/dependabot[bot]))

#### Authors: 2

- [@dependabot[bot]](https://github.com/dependabot[bot])
- James Newell ([@jameslnewell](https://github.com/jameslnewell))

---

# v0.7.2 (Wed Oct 07 2026)

#### 🐛 Bug Fix

- Match dotfiles in path globs [#48](https://github.com/jameslnewell/git-diff/pull/48) ([@jameslnewell](https://github.com/jameslnewell))

#### Authors: 1

- James Newell ([@jameslnewell](https://github.com/jameslnewell))

---

# v0.7.1 (Mon Oct 05 2026)

#### 🐛 Bug Fix

- Remove the unused fast-glob dependency [#47](https://github.com/jameslnewell/git-diff/pull/47) ([@jctdeemenu](https://github.com/jctdeemenu))
- Bump prettier from 3.9.8 to 3.9.9 [#46](https://github.com/jameslnewell/git-diff/pull/46) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump prettier from 3.9.6 to 3.9.8 [#44](https://github.com/jameslnewell/git-diff/pull/44) ([@dependabot[bot]](https://github.com/dependabot[bot]))

#### Authors: 2

- [@dependabot[bot]](https://github.com/dependabot[bot])
- John Christopher Dee ([@jctdeemenu](https://github.com/jctdeemenu))

---

# v0.7.0 (Wed Sep 16 2026)

#### 🚀 Enhancement

- Add mergeBaseAsync/mergeBaseSync for diffing what a branch changed [#41](https://github.com/jameslnewell/git-diff/pull/41) ([@jameslnewell](https://github.com/jameslnewell))

#### Authors: 1

- James Newell ([@jameslnewell](https://github.com/jameslnewell))

---

# v0.6.0 (Thu Sep 10 2026)

#### 🚀 Enhancement

- Say which ref was missing, not just that one was [#39](https://github.com/jameslnewell/git-diff/pull/39) ([@jameslnewell](https://github.com/jameslnewell))

#### Authors: 1

- James Newell ([@jameslnewell](https://github.com/jameslnewell))

---

# v0.5.0 (Thu Sep 10 2026)

#### 🚀 Enhancement

- Return the empty tree as the base that means "diff everything" [#38](https://github.com/jameslnewell/git-diff/pull/38) ([@jameslnewell](https://github.com/jameslnewell))
- Bump prettier from 3.8.4 to 3.9.4 [#28](https://github.com/jameslnewell/git-diff/pull/28) ([@dependabot[bot]](https://github.com/dependabot[bot]))

#### 🐛 Bug Fix

- Bump picomatch from 4.0.5 to 4.0.7 [#35](https://github.com/jameslnewell/git-diff/pull/35) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump prettier from 3.9.5 to 3.9.6 [#32](https://github.com/jameslnewell/git-diff/pull/32) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump prettier from 3.9.4 to 3.9.5 [#29](https://github.com/jameslnewell/git-diff/pull/29) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump picomatch from 4.0.4 to 4.0.5 [#27](https://github.com/jameslnewell/git-diff/pull/27) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump prettier from 3.8.3 to 3.8.4 [#23](https://github.com/jameslnewell/git-diff/pull/23) ([@dependabot[bot]](https://github.com/dependabot[bot]))

#### Authors: 2

- [@dependabot[bot]](https://github.com/dependabot[bot])
- James Newell ([@jameslnewell](https://github.com/jameslnewell))

---

# v0.4.1 (Mon May 25 2026)

#### 🐛 Bug Fix

- Fix name-status parsing of renames, copies and dotfiles [#21](https://github.com/jameslnewell/git-diff/pull/21) ([@jameslnewell](https://github.com/jameslnewell))

#### Authors: 1

- James Newell ([@jameslnewell](https://github.com/jameslnewell))

---

# v0.4.0 (Fri May 15 2026)

#### 🚀 Enhancement

- Bump prettier from 3.5.3 to 3.8.3 [#18](https://github.com/jameslnewell/git-diff/pull/18) ([@dependabot[bot]](https://github.com/dependabot[bot]))

#### 🐛 Bug Fix

- Use a RELEASE_TOKEN PAT for auto shipit's push [#19](https://github.com/jameslnewell/git-diff/pull/19) (jameslnewell@gmail.com)
- Enable Dependabot with auto-merge for minor and patch updates [#6](https://github.com/jameslnewell/git-diff/pull/6) (jameslnewell@gmail.com)

#### 🔩 Dependency Updates

- Bump picomatch and @types/picomatch [#12](https://github.com/jameslnewell/git-diff/pull/12) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump debug and @types/debug [#14](https://github.com/jameslnewell/git-diff/pull/14) ([@dependabot[bot]](https://github.com/dependabot[bot]))

#### Authors: 2

- [@dependabot[bot]](https://github.com/dependabot[bot])
- James Newell ([@jameslnewell](https://github.com/jameslnewell))

---

# v0.3.0 (Fri May 15 2026)

#### 🚀 Enhancement

- Export `isBadRevisionError` guard for detecting bad-revision errors [#5](https://github.com/jameslnewell/git-diff/pull/5) ([@jameslnewell](https://github.com/jameslnewell))

#### Authors: 1

- James Newell ([@jameslnewell](https://github.com/jameslnewell))

---

# v0.2.0 (Wed May 13 2026)

#### 🚀 Enhancement

- Use namespace imports in tests [#4](https://github.com/jameslnewell/git-diff/pull/4) ([@jameslnewell](https://github.com/jameslnewell))

#### Authors: 1

- James Newell ([@jameslnewell](https://github.com/jameslnewell))

---

# v0.1.2 (Wed May 13 2026)

#### 🐛 Bug Fix

- Add functional API for inspecting git diff results [#3](https://github.com/jameslnewell/git-diff/pull/3) ([@jameslnewell](https://github.com/jameslnewell))

#### Authors: 1

- James Newell ([@jameslnewell](https://github.com/jameslnewell))

---

# v0.1.1 (Tue May 12 2026)

#### 🐛 Bug Fix

- Add author field for auto shipit commit attribution [#2](https://github.com/jameslnewell/git-diff/pull/2) ([@jameslnewell](https://github.com/jameslnewell))
- Add GitHub Actions workflow for CI + npm publishing [#1](https://github.com/jameslnewell/git-diff/pull/1) ([@jameslnewell](https://github.com/jameslnewell))

#### ⚠️ Pushed to `main`

- implement diff functions ([@jameslnewell](https://github.com/jameslnewell))
- use debug to log command args ([@jameslnewell](https://github.com/jameslnewell))
- initial commit ([@jameslnewell](https://github.com/jameslnewell))

#### Authors: 1

- James Newell ([@jameslnewell](https://github.com/jameslnewell))
