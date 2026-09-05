# Firma de código con Azure Trusted Signing

Este documento explica cómo conseguir la firma digital para que `Dashboard Uso APIs`
pueda publicarse como una app **oficial y firmada** en Windows, usando
**Azure Trusted Signing** (Microsoft). Se hace una vez que la aplicación esté
validada y funcionando bien.

## Por qué hace falta firma

Windows (SmartScreen, Smart App Control) y los EDR corporativos solo dan
confianza a un ejecutable si reconoce la **identidad del editor** mediante una
firma Authenticode válida. Esta app ya se empaqueta correctamente, pero sus
binarios locales aparecen como `Authenticode: NotSigned`. Para distribuirlo al
público hace falta un certificado reconocido. Un certificado **autofirmado** no
sirve: no aporta reputación. Ver [SECURITY.md](./SECURITY.md) y
[PROJECT_CLOSURE.md](./PROJECT_CLOSURE.md).

## Qué implica la firma

La firma NO cambia la funcionalidad ni la seguridad interna de la app: ya
cumple (DPAPI, broker con token, renderer sin secretos, fuses endurecidos). Lo
que aporta es **identidad e integridad verificables**: el antivirus sabe quién
lo publicó y que no fue alterado. Además del sello, en entornos corporativos
puede hacer falta el _allowlisting_ de editor/hash en la política del EDR.

## Dos caminos

### A. Certificado de firma comprado (OV/EV) `→` PFX `→` pipeline actual

- Compras un certificado a un proveedor (DigiCert, Sectigo, SSL.com…). El tipo
  `EV` exige a veces un dongle físico.
- Lo exportas a `.pfx` y guardas en GitHub los secretos que el proyecto **ya** usa:

  | Secreto                | Valor                            |
  | ---------------------- | -------------------------------- |
  | `WIN_CSC_LINK`         | Base64 del contenido del `.pfx`  |
  | `WIN_CSC_KEY_PASSWORD` | Contraseña que protege el `.pfx` |

- Con esto, el pipeline `release:windows` ya firma, valida Authenticode
  (`Valid`) y genera `SHA256SUMS.txt`, sin tocar nada más.

> Este camino aplica a certificados que te dejan exportar la clave privada.
> **Azure Trusted Signing no lo permite**, porque la clave nunca sale de
> Microsoft.

### B. Azure Trusted Signing (objetivo para este proyecto)

Servicio gestionado por Microsoft; la clave se queda en Azure y no la exportas.
Tiene plan con nivel gratuito (limita el número de firmas al mes). Es la vía
recomendada para una app como esta: sin desembolso inicial y con identidad de
Microsoft, que Windows reconoce mejor.

#### Pasos en Azure

1. **Cuenta y permisos.** Una suscripción de Azure (la gratuita vale) y acceso
   de identidad (Entra ID). Necesitas rol que permita crear recursos y aprobar
   la identidad de firma en tu tenant.
2. **Crear el recurso «Trusted Signing».** En Azure Portal busca «Trusted
   Signing» → Create. Elige:
   - **SKU:** Basic (inicial/gratuita) o Premium (más firma).
   - **Tipo de validación de identidad:** la célebre «Public» (verificación por
     controladores) u «Identity validation». Para uso de una persona,
     normalmente se elige «Basic» + validación de identidad.
3. **Crear un «Certificate Profile»** dentro del recurso. El perfil define la
   firma y el nivel de validación; anota su nombre e identificador.
4. **Obtener una identidad de firma** (signing identity). Para automatizar la
   firma en GitHub, lo habitual es:
   - Registrar una **App (service principal)** en Entra ID con acceso al recurso.
   - O usar una **Managed Identity** si el CI corre sobre una máquina de Azure
     (no es el caso de GitHub Actions en Windows, así que aquí conviene la app).
5. **Credenciales para GitHub.** Añadir como Actions secrets (Settings → Secrets):

   | Secreto                    | Valor                                           |
   | -------------------------- | ----------------------------------------------- |
   | `AZURE_TENANT_ID`          | `tenantId` de Entra ID                          |
   | `AZURE_CLIENT_ID`          | `appId` de la App registrada                    |
   | `AZURE_CLIENT_SECRET`      | secreto de esa App                              |
   | `AZURE_KEY_VAULT_ENDPOINT` | endpoint del recurso/perfil (según integración) |

6. **Integración con el empacador.** `@electron/windows-sign` (ya incluido,
   vía `@electron/windows-sign`/signtool) soporta proveedores cloud (Azure Key
   Vault / Trusted Signing) mediante **parámetros personalizados de signtool
   (`signWithParams`)**. Para `electron-builder` esto se configura con las
   opciones de firma de Azure (`azureSignOptions`) y/o parámetros de signtool
   que apunten a Azure (por ejemplo `-dlib` + `-dl` con el plugin de Azure).
   **Nota:** este cableado aún no está ejecutado ni validado en el pipeline; se
   implementa como paso de integración y se valida con el recurso real.

#### Verificación obligatoria (en cada release con Azure)

- `Get-AuthenticodeSignature` de Setup y portable con estado `Valid`.
- Timestamp válido.
- `SHA256SUMS.txt` publicado junto a los binarios.
- Instalación limpia y desinstalación en una máquina Windows sin el entorno de
  desarrollo.
- Para empresa: entregar editor, versión, hash y release al equipo EDR para su
  allowlisting.

## Cuándo hacerlo y orden sugerido

1. Verificar que la app funciona bien con tus cuentas (login real por
   suscripción y por API key en los cuatro proveedores) y ver uso/saldo
   disponible.
2. Crear el recursos y perfil en Azure Trusted Signing.
3. Configurar la App registrada y los secretos en GitHub.
4. Implementar/validar el cableado de firma Azure en el pipeline y ejecutar una
   release de prueba con `tag v0.2.3`.
5. Superar el checklist de [PACKAGING.md](./PACKAGING.md) y publicar.

## Dónde viven los secretos

Nunca en el repositorio ni en el código: van como **Actions secrets** cifradas.
El workflow los usa solo en el momento de compilar. No deben aparecer en `git
status`, logs ni artefactos. Un secreto comprometido se rota y se revoca en
Azure/Entra.

## Documentos relacionados

- [Empaquetado y release](./PACKAGING.md)
- [Seguridad y credenciales](./SECURITY.md)
- [Cierre y reapertura](./PROJECT_CLOSURE.md)
- [Auditoría y estado](./AUDIT_2026-09-05.md)
