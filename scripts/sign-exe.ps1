# Firma los ejecutables de dist\ con un certificado de codigo autofirmado.
#
# Esto NO libera Smart App Control (SAC solo confia en firmantes con
# reputacion en la nube de Microsoft; un certificado autofirmado nunca la
# tiene). Sirve para:
#   - Evitar el aviso clasico de SmartScreen "Windows protegio su PC" en
#     equipos que YA confien en el certificado (ver mas abajo).
#   - Dejar el binario firmado (integridad verificable) en vez de sin firmar.
#
# Para distribuir de verdad a terceros sin avisos, usa un certificado de una
# CA reconocida (ver README.md).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\sign-exe.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exePaths = @(
  (Join-Path $root 'dist\dashboard.exe'),
  (Join-Path $root 'dist\DashboardTray.exe')
)
$certPath = Join-Path $root 'dist\dashboard-uso-apis-dev.cer'
$subject = 'CN=Dashboard Uso APIs (local dev)'

foreach ($exePath in $exePaths) {
  if (-not (Test-Path $exePath)) {
    Write-Error "No existe $exePath. Ejecuta antes: npm run exe"
  }
}

$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
  Where-Object { $_.Subject -eq $subject } |
  Select-Object -First 1

if (-not $cert) {
  Write-Host "Generando certificado de firma local ($subject)..."
  $cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $subject `
    -CertStoreLocation Cert:\CurrentUser\My `
    -KeyUsage DigitalSignature `
    -FriendlyName 'Dashboard Uso APIs local signing' `
    -NotAfter (Get-Date).AddYears(5)
}

foreach ($exePath in $exePaths) {
  Write-Host "Firmando $exePath con el certificado $($cert.Thumbprint)..."
  $sig = Set-AuthenticodeSignature -FilePath $exePath -Certificate $cert
  Write-Host "Estado de la firma: $($sig.Status) - $($sig.StatusMessage)"
}

Export-Certificate -Cert $cert -FilePath $certPath | Out-Null
Write-Host ""
Write-Host "Certificado publico exportado a: $certPath"
Write-Host ""
Write-Host "Para que ESTE equipo confie en el certificado (opcional, solo SmartScreen):"
Write-Host "  1. Doble clic en $certPath"
Write-Host "  2. 'Instalar certificado' -> 'Equipo local' (o 'Usuario actual')"
Write-Host "  3. 'Colocar todos los certificados en el siguiente almacen' -> 'Entidades de certificacion raiz de confianza'"
Write-Host ""
Write-Host "Esto NO evita el bloqueo de Smart App Control si esta en 'Activado'."
