param(
    [string]$ZipPath,
    [string]$FileListFile
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

$zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
$files = Get-Content $FileListFile

foreach ($f in $files) {
    $f = $f.Trim()
    if ($f.Length -eq 0) { continue }
    $item = Get-Item $f
    $fullPath = $item.FullName
    $entryName = $f.Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $fullPath, $entryName) | Out-Null
}

$zip.Dispose()
Write-Host "ZIP created successfully at $ZipPath"
