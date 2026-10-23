# Carro listo

Planificador de traslados con inicio de sesión de Google y estimaciones privadas por cuenta.

## Firebase Authentication

1. En Firebase Console, habilitá **Authentication → Sign-in method → Google**.
2. En **Authentication → Settings → Authorized domains**, agregá el dominio publicado en Vercel y cualquier dominio local que uses para desarrollo.
3. Completá `.env` con la configuración de la app web de Firebase. En Vercel, cargá las mismas variables `VITE_FIREBASE_*` en las variables de entorno y volvé a desplegar.

La app usa Google Popup Sign-in. Cada estimación se guarda en `users/{uid}/estimates/{estimateId}`. La app solo consulta la subcolección del usuario autenticado.

## Reglas de Cloud Firestore

Publicá las reglas de [firestore.rules](./firestore.rules) desde **Firestore Database → Rules**. Reemplazá el conjunto de reglas anterior completo y pulsá **Publish**. Las reglas anteriores del historial compartido no deben quedar activas: las reglas de Firestore se combinan y cualquier regla permisiva que coincida podría seguir dando acceso.

También podés publicarlas desde una sesión autenticada de Firebase CLI con `npx firebase-tools deploy --only firestore:rules`.

Las reglas nuevas limitan lectura y creación al UID autenticado de la ruta. Los visitantes no autenticados y otros usuarios no pueden leer estas estimaciones. La app no permite editar ni borrar estimaciones.

## Eliminar el historial compartido anterior

La app nueva deja de leer y escribir `calculationHistory`, pero las reglas de seguridad no borran documentos que ya están en Firestore. Después de publicar la app nueva y confirmar que Vercel sirve esa versión, eliminá la colección anterior en **Firestore Database → Data**: abrí `calculationHistory`, elegí **Delete collection** y confirmá. Esto borra permanentemente las estimaciones compartidas anteriores.

No hay credenciales administrativas de Firebase en este repositorio ni en el entorno de desarrollo, así que la colección debe eliminarse desde la consola de Firebase con una cuenta que tenga permisos de administración.

## Desarrollo

```sh
npm install
npm run dev
```

Reiniciá el servidor de desarrollo después de editar `.env`.
