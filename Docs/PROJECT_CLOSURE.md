# Cierre temporal del proyecto

## Estado a 14 de agosto de 2026

El desarrollo funcional queda **cerrado temporalmente en la versión `0.2.2`**.
El widget, el dashboard local, la configuración, la persistencia segura y el
empaquetado actual están implementados y validados en el equipo de referencia.

Este cierre significa que no hay trabajo funcional pendiente conocido. No
significa que los ejecutables locales puedan distribuirse todavía como una
release pública apta para cualquier equipo.

## Línea base validada

- Widget Electron visible, recuperable desde la bandeja y compatible con varios monitores.
- Panel de configuración del widget operativo.
- Dashboard local respondiendo con HTTP 200 en `127.0.0.1:3000`.
- Cuatro proveedores reales renderizados en la instalación final probada.
- Credenciales y sesiones cifradas mediante `safeStorage`/DPAPI.
- Sin secretos en el renderer, `localStorage`, cookies propias o el repositorio.
- Renderer cargado desde un protocolo interno con lista cerrada de recursos.
- 50/50 tests, lint, TypeScript, build y auditoría sin vulnerabilidades correctos.
- Setup y portable `0.2.2` generados; instalación sobre `0.2.1` comprobada.
- Commit de la línea base funcional: `f211c7c`.

Los detalles reproducibles están en [PROJECT_STATUS.md](./PROJECT_STATUS.md),
[ARCHITECTURE.md](./ARCHITECTURE.md) y [PACKAGING.md](./PACKAGING.md).

## Deuda abierta: certificado de firma de código

| Campo | Estado |
|---|---|
| Tipo | Distribución y confianza del editor |
| Prioridad | Bloqueante para una release pública de Windows |
| Impacto funcional | Ninguno en el equipo donde `0.2.2` ya fue instalado y probado |
| Evidencia actual | Setup y portable locales muestran `Authenticode: NotSigned` |
| Riesgo | SmartScreen, Smart App Control o un EDR corporativo pueden bloquearlos |
| Solución | Certificado reconocido o Azure Trusted Signing, timestamp y publicación desde CI |

La deuda no se resuelve desactivando el antivirus, creando exclusiones generales
ni usando un certificado autofirmado. Tampoco puede garantizarse aceptación en
todo entorno corporativo solo con cambios de código: además de la firma, algunas
empresas exigen reputación o allowlisting de editor/hash.

Hasta resolverla:

- no publicar los EXE locales `0.2.2` como GitHub Release;
- no afirmar que pueden instalarse en cualquier PC;
- no pedir a usuarios que ignoren alertas del sistema o del EDR;
- distribuir el código fuente y usar `npm run electron:dev` para desarrollo;
- conservar `dist/SHA256SUMS-UNSIGNED.txt` únicamente como comprobación local.

## Condiciones para reabrir y publicar

1. Obtener el certificado reconocido y decidir la identidad exacta del editor.
2. Configurar `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD` como secretos de GitHub Actions.
3. Incrementar versión, crear el tag correspondiente y ejecutar el workflow de release Windows.
4. Confirmar `Get-AuthenticodeSignature` con estado `Valid` y timestamp válido en Setup y portable.
5. Publicar `SHA256SUMS.txt` generado por el pipeline, no el fichero local `-UNSIGNED`.
6. Probar instalación, actualización y desinstalación en una máquina Windows limpia.
7. Para empresa, entregar editor, versión, hash y release al equipo EDR para su allowlisting.
8. Actualizar README, estado y este documento con la evidencia real de la release firmada.

## Regla de mantenimiento durante el cierre

No realizar nuevas iteraciones salvo una corrección de seguridad, una rotura por
cambio de proveedor o la reapertura explícita del proyecto. Dependabot y CI
pueden seguir señalando mantenimiento necesario, pero cualquier actualización
debe volver a pasar los criterios de validación de `AGENTS.md`.
