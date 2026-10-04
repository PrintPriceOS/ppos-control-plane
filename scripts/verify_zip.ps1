param(
    [string]$ZipPath,
    [string]$ManifestFile
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$sha256 = [System.Security.Cryptography.SHA256]::Create()
$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)

$expected = @{}
Get-Content $ManifestFile | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -gt 0) {
        $parts = $line -split '\s+', 2
        if ($parts.Count -eq 2) {
            $expected[$parts[1].Replace('\', '/')] = $parts[0]
        }
    }
}

$errors = 0
foreach ($entry in $zip.Entries) {
    $entryName = $entry.FullName.Replace('\', '/')
    if ($entryName -eq 'SHA256SUMS.txt') { continue }
    
    $stream = $entry.Open()
    $hashBytes = $sha256.ComputeHash($stream)
    $stream.Close()
    $actualHash = [BitConverter]::ToString($hashBytes).Replace('-', '').ToLower()
    
    $expectedHash = $expected[$entryName]
    if (-not $expectedHash) {
        Write-Error "UNEXPECTED ENTRY IN ZIP: ${entryName}"
        $errors++
    } elseif ($expectedHash -ne $actualHash) {
        Write-Error "BYTE HASH MISMATCH for ${entryName}: Expected ${expectedHash}, got ${actualHash}"
        $errors++
    } else {
        Write-Host "BYTE VERIFIED MATCH: ${entryName} (${actualHash})"
    }
}

$zip.Dispose()

if ($errors -gt 0) {
    Write-Error "Verification failed with $errors error(s)."
    exit 1
} else {
    Write-Host "ALL ENTRIES IN $ZipPath VERIFIED BYTE-FOR-BYTE AGAINST MANIFEST SUCCESSFUL!"
    exit 0
}
