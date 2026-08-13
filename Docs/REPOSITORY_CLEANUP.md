# Limpieza única del historial de Git

## Motivo

Las revisiones locales anteriores a `0.2.0` incluyeron artefactos de `dist/`. Dos
ejecutables superan los 100 MB, por lo que GitHub rechazará la rama aunque esos
archivos se borren en un commit posterior: los blobs siguen formando parte del
historial que se intenta publicar.

El árbol actual ya ignora `dist/`, `.next/`, diagnósticos y artefactos de release.
La limpieza descrita aquí sólo es necesaria una vez, antes de publicar la rama.

## Condiciones previas

Reescribir el historial cambia los identificadores de commit y obliga a coordinar
un `push --force-with-lease`. Antes de hacerlo:

1. confirmar que no hay colaboradores trabajando sobre la rama remota;
2. crear una copia o etiqueta de respaldo fuera de la rama que se publicará;
3. confirmar que el árbol de trabajo no contiene cambios ajenos sin guardar;
4. instalar `git-filter-repo` desde su distribución oficial.

## Procedimiento recomendado

Desde una copia de respaldo y con autorización explícita del mantenedor:

```powershell
git filter-repo --path dist --invert-paths
git fsck --full
git count-objects -vH
git push --force-with-lease origin main
```

Después se debe clonar de nuevo desde GitHub y ejecutar:

```powershell
npm ci
npm run check
npm run build
```

No se debe usar Git LFS para el contenido completo de `dist/`. Los instaladores
firmados pertenecen a GitHub Releases; el repositorio debe contener únicamente
fuentes, lockfile, documentación, workflows y recursos necesarios para construir.
