$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$exe = Join-Path $repo 'frontend/public/halicx-setup-windows.exe'
[void][Reflection.Assembly]::LoadFile($exe)
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('halicmind-setup-test-' + [Guid]::NewGuid().ToString('N'))
$allowedRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
if (![IO.Path]::GetFullPath($testRoot).StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test path' }
try {
    [void][ExtensionPackage]::Prepare($testRoot)
    $files = @(Get-ChildItem -LiteralPath $testRoot -File)
    if ($files.Count -ne 7) { throw 'Unexpected file count' }
    foreach ($file in $files) {
        $source = Join-Path $repo ('extension/halicx/' + $file.Name)
        if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $file.FullName).Hash) { throw 'Content mismatch' }
    }
    [IO.File]::WriteAllText((Join-Path $testRoot 'connect.js'), 'old version')
    [void][ExtensionPackage]::Prepare($testRoot)
    if ((Get-FileHash -LiteralPath (Join-Path $testRoot 'connect.js')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $repo 'extension/halicx/connect.js')).Hash) { throw 'Update failed' }
    Write-Output 'Windows helper: embedded integrity, extraction and in-place update passed.'
} finally {
    if (Test-Path -LiteralPath $testRoot) {
        $resolvedTestRoot = (Resolve-Path -LiteralPath $testRoot).Path
        if (!$resolvedTestRoot.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe cleanup path' }
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
    }
}
