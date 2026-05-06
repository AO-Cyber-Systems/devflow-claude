'use strict';

/**
 * wrappers/powershell — PowerShell 7+ (pwsh) dispatch wrapper (TRD 20-05).
 *
 * Key differences from bash/fish:
 *   - `$VAR` declared with `$` prefix on assignment AND read
 *   - `[System.IO.Path]::GetTempFileName()` instead of `mktemp`
 *   - `& { cmd } *> $dfwOut 2> $dfwErr` for stream redirection
 *     (`*>` redirects all streams 1+3+4+5+6 to $dfwOut, then `2>` overrides
 *     stream 2 → $dfwErr; stream-precedence-respecting)
 *   - `$LASTEXITCODE` instead of `$?` (which is boolean in pwsh)
 *   - Default $LASTEXITCODE to 0 when null (cmd that doesn't set it)
 *   - `Write-Output` (canonical) instead of `echo` (alias only)
 *
 * Sentinel pattern is identical to bash — Write-Output emits plain ASCII.
 *
 * v1.2 targets pwsh 7+; Windows powershell.exe 5.x may work but is
 * documented as best-effort.
 *
 * Interface: { shellName, shellArgs, wrapCommand, lineSep, initLines }
 */

module.exports = {
  shellName: 'powershell',

  shellArgs: (interactive) => (interactive ? ['-NoLogo', '-NoExit'] : ['-NoLogo']),

  lineSep: '\n',

  initLines: (mode) => {
    // pwsh on macOS/linux respects PSReadLine prompt; clear it via
    // Set-PSReadLineOption when the module is present.
    return [
      "$Function:prompt = { '' }",
      "$global:ProgressPreference = 'SilentlyContinue'",
      "if (Get-Module PSReadLine) { Set-PSReadLineOption -PromptText '' -ContinuationPrompt '' }",
    ];
  },

  wrapCommand: (cmd, id) => {
    const begin = `__DFW_BEGIN_${id}__`;
    const delim = `__DFW_DELIM_${id}__`;
    const end = `__DFW_END_${id}__`;
    return [
      '$dfwOut = [System.IO.Path]::GetTempFileName()',
      '$dfwErr = [System.IO.Path]::GetTempFileName()',
      `& { ${cmd} } *> $dfwOut 2> $dfwErr`,
      '$dfwRc = $LASTEXITCODE; if ($null -eq $dfwRc) { $dfwRc = 0 }',
      `Write-Output "${begin}"`,
      'Get-Content $dfwOut -ErrorAction SilentlyContinue',
      `Write-Output "${delim}"`,
      'Get-Content $dfwErr -ErrorAction SilentlyContinue',
      `Write-Output ("${end}:" + $dfwRc)`,
      'Remove-Item $dfwOut, $dfwErr -Force -ErrorAction SilentlyContinue',
      '',
    ];
  },
};
