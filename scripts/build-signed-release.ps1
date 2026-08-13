$ErrorActionPreference = 'Stop'

if (-not $env:WIN_CSC_LINK -or -not $env:WIN_CSC_KEY_PASSWORD) {
    throw 'Faltan WIN_CSC_LINK y WIN_CSC_KEY_PASSWORD. Las releases públicas deben firmarse con un certificado de firma de código reconocido.'
}

npm run check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run electron:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$artifacts = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..\dist') -Filter 'Dashboard Uso APIs-*.exe' -File
if (-not $artifacts) { throw 'El build no generó ejecutables.' }

$invalid = foreach ($artifact in $artifacts) {
    $signature = Get-AuthenticodeSignature -LiteralPath $artifact.FullName
    if ($signature.Status -ne 'Valid') { $artifact.Name }
}
if ($invalid) { throw "Firma inválida o ausente: $($invalid -join ', ')" }

$artifacts | Get-FileHash -Algorithm SHA256 | ForEach-Object {
    "{0}  {1}" -f $_.Hash.ToLowerInvariant(), (Split-Path $_.Path -Leaf)
} | Set-Content -LiteralPath (Join-Path $PSScriptRoot '..\dist\SHA256SUMS.txt') -Encoding ascii
