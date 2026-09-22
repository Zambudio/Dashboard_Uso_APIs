# Documentación del proyecto

Este directorio es la fuente de verdad técnica y operativa de Dashboard_Uso_APIs.

## Por perfil

### Usuario final

1. [Instalación en Windows](./INSTALLATION_WINDOWS.md)
2. [Despliegue con Docker (PC o servidor)](./DOCKER.md)
3. [Operación y resolución de problemas](./OPERATIONS_TROUBLESHOOTING.md)
4. [Proveedores y métricas](./PROVIDERS.md)
5. [Seguridad y credenciales](./SECURITY.md)

### Desarrollo y mantenimiento

1. [Arquitectura y flujos](./ARCHITECTURE.md)
2. [Sincronización de suscripciones (PC -> NAS)](./SYNC_SUBSCRIPTIONS.md)
3. [Referencia de API local](./API_REFERENCE.md)
4. [Desarrollo y ampliación](./DEVELOPMENT.md)
5. [Compilación y empaquetado](./PACKAGING.md)
6. [Guía de conexión SSH al NAS](../Guia_Conexion_ssh_NAS.md)
7. [Estado actual e historial técnico](./PROJECT_STATUS.md)
8. [Cierre temporal y deuda pendiente](./PROJECT_CLOSURE.md)
9. [Limpieza única del historial de Git](./REPOSITORY_CLEANUP.md)
10. [Contexto de continuación](../PROJECT_CONTEXT.md)

## Regla de mantenimiento

Todo cambio de código, arquitectura, configuración, empaquetado, seguridad o comportamiento debe actualizar en el mismo commit:

- el documento especializado correspondiente;
- [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) si cambia el estado validado o las limitaciones;
- [`../PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) si cambia la forma de continuar el proyecto;
- [`../README.md`](../README.md) si afecta al usuario final.

No se debe documentar como validado algo que sólo esté planificado.
