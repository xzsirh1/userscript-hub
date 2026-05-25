# Changelog

All notable changes to this project are documented here.

## Unreleased

### Added

- Added first-run setup flow for new deployments, including platform name and administrator account initialization.
- Added runtime authorization, approval, device binding, usage tracking, and remote-core distribution workflows.
- Added update package generation through the single standard script `node scripts/create-update.js`.

### Changed

- Renamed default platform branding to the generic `脚本分发平台`.
- Renamed default service/process identifiers to `userscript-hub`.
- Improved mobile layouts for administration pages and runtime authorization screens.
- Improved remote-core shell behavior for Tampermonkey sandbox compatibility and stricter CSP sites.

### Security

- New deployments no longer rely on a hard-coded default admin account.
- Public documentation and examples use placeholders instead of private server addresses or credentials.
