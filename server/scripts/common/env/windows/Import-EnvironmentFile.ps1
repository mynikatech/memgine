function Import-MemgineEnvironmentFile {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { throw "Environment file not found: $Path" }
    $lineNumber = 0
    Get-Content -LiteralPath $Path | ForEach-Object {
        $lineNumber++
        $raw = $_
        $trimmedStart = $raw.TrimStart()
        if ([string]::IsNullOrWhiteSpace($trimmedStart) -or $trimmedStart.StartsWith('#')) { return }
        $equals = $raw.IndexOf('=')
        if ($equals -lt 1) { throw "Malformed environment entry at line $lineNumber in $Path." }
        $name = $raw.Substring(0, $equals).Trim()
        $value = $raw.Substring($equals + 1)
        if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "Malformed environment variable name at line $lineNumber in $Path." }
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}