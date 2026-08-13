# Política de seguridad

## Versiones compatibles

Mientras el proyecto esté en fase `0.x`, solo la versión más reciente recibe correcciones de seguridad.

## Comunicar una vulnerabilidad

No publiques credenciales, volcados de sesión ni detalles explotables en un issue. Usa la función **Report a vulnerability** de la pestaña Security del repositorio de GitHub. Si no está habilitada, contacta de forma privada con el mantenedor indicado en el perfil del repositorio.

Incluye una descripción, impacto, pasos mínimos de reproducción y versión afectada. No incluyas secretos reales: revócalos antes y usa valores redactados.

## Modelo de seguridad

La aplicación escucha exclusivamente en `127.0.0.1`. En Electron, las credenciales se cifran con `safeStorage`/DPAPI y nunca se devuelven al renderer; las preferencias no sensibles se guardan por separado. El proyecto no ofrece garantías si se modifica para escuchar en la red sin añadir autenticación y una revisión específica.

Las releases públicas para Windows deben estar firmadas con un certificado de firma de código reconocido y acompañadas de sumas SHA-256. Una firma autofirmada no evita SmartScreen, Smart App Control ni las políticas EDR corporativas.
