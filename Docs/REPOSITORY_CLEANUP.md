# Limpieza del historial de Git

## Estado

Completada el 13 de agosto de 2026 antes de publicar `0.2.0`:

- respaldo completo creado y verificado fuera del repositorio;
- `dist/` eliminado de todas las referencias mediante `git-filter-repo`;
- ninguna ruta `dist/` permanece en el historial alcanzable;
- base de objetos reducida de 1,20 GiB a aproximadamente 553 KiB;
- artefactos locales preservados como archivos ignorados.

## Motivo

Las revisiones locales anteriores a `0.2.0` incluyeron artefactos de `dist/`. Dos
ejecutables superan los 100 MB, por lo que GitHub rechazará la rama aunque esos
archivos se borren en un commit posterior: los blobs siguen formando parte del
historial que se intenta publicar.

El árbol actual ignora `dist/`, `.next/`, diagnósticos y artefactos de release.
Este procedimiento queda documentado como registro operativo y no debe repetirse
en clones creados después de la publicación del historial limpio.

## Procedimiento utilizado

Reescribir el historial cambia los identificadores de commit. Las condiciones
aplicadas fueron:

1. confirmar que no hay colaboradores trabajando sobre la rama remota;
2. crear una copia o etiqueta de respaldo fuera de la rama que se publicará;
3. confirmar que el árbol de trabajo no contiene cambios ajenos sin guardar;
4. instalar `git-filter-repo` desde su distribución oficial.

Con respaldo y autorización explícita del mantenedor:

```powershell
git filter-repo --path dist --invert-paths --force
git fsck --full
git count-objects -vH
git push --force-with-lease origin main
```

Después de publicar se valida desde un clon nuevo:

```powershell
npm ci
npm run check
npm run build
```

No se debe usar Git LFS para el contenido completo de `dist/`. Los instaladores
firmados pertenecen a GitHub Releases; el repositorio debe contener únicamente
fuentes, lockfile, documentación, workflows y recursos necesarios para construir.
