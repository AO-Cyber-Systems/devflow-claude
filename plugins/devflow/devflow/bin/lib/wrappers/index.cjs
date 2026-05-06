'use strict';

/**
 * wrappers/index — getWrapper(shellName) factory + UnsupportedShell error
 * class (TRD 20-05).
 *
 * Routes:
 *   bash, zsh           → wrappers/bash.cjs   (zsh bash-compatible for
 *                                              sentinel pattern; same module)
 *   fish                → wrappers/fish.cjs
 *   pwsh, powershell    → wrappers/powershell.cjs (incl. powershell.exe)
 *   anything else       → throws UnsupportedShell
 *
 * Accepts either a basename or a full path; `.exe` is stripped so
 * Windows powershell.exe routes to the powershell wrapper.
 */

const path = require('path');

class UnsupportedShell extends Error {
  constructor(shellName) {
    super(`unsupported shell: ${shellName} (supported: bash, zsh, fish, pwsh, powershell)`);
    this.name = 'UnsupportedShell';
    this.code = 'EUNSUPPORTEDSHELL';
  }
}

const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish', 'pwsh', 'powershell'];

function getWrapper(shellPath) {
  // Accept full path OR basename; strip .exe (Windows) suffix
  const base = path.basename(String(shellPath || '').replace(/\.exe$/i, ''));
  if (base === 'bash' || base === 'zsh') return require('./bash.cjs');
  if (base === 'fish') return require('./fish.cjs');
  if (base === 'pwsh' || base === 'powershell') return require('./powershell.cjs');
  throw new UnsupportedShell(base || '<empty>');
}

module.exports = { getWrapper, UnsupportedShell, SUPPORTED_SHELLS };
