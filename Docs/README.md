# Documentación del proyecto

Este directorio es la fuente de verdad técnica y operativa de Dashboard_Uso_APIs.

## Por perfil

### Usuario final

1. [Instalación en Windows](./INSTALLATION_WINDOWS.md)
2. [Operación y resolución de problemas](./OPERATIONS_TROUBLESHOOTING.md)
3. [Proveedores y métricas](./PROVIDERS.md)
4. [Seguridad y credenciales](./SECURITY.md)

### Desarrollo y mantenimiento

1. [Arquitectura y flujos](./ARCHITECTURE.md)
2. [Referencia de API local](./API_REFERENCE.md)
3. [Desarrollo y ampliación](./DEVELOPMENT.md)
4. [Compilación y empaquetado](./PACKAGING.md)
5. [Estado actual e historial técnico](./PROJECT_STATUS.md)
6. [Limpieza única del historial de Git](./REPOSITORY_CLEANUP.md)
7. [Contexto de continuación](../PROJECT_CONTEXT.md)

## Regla de mantenimiento

Todo cambio de código, arquitectura, configuración, empaquetado, seguridad o comportamiento debe actualizar en el mismo commit:

- el documento especializado correspondiente;
- [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) si cambia el estado validado o las limitaciones;
- [`../PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) si cambia la forma de continuar el proyecto;
- [`../README.md`](../README.md) si afecta al usuario final.

No se debe documentar como validado algo que sólo esté planificado.
